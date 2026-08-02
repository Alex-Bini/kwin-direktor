/**
 * ============================================================================
 * Direktor: Wayland-First Tiling Manager for KWin Plasma 6
 * ============================================================================
 * Main Entry Point (`main.js`)
 * Orchestrates Configuration, Window Rules, D-Bus IPC, and Layout Engines.
 */

import { ConfigManager } from "./config/ConfigManager.js";
import { WindowRuleEngine } from "./config/WindowRuleEngine.js";
import { LayoutManager } from "./layouts/LayoutManager.js";
import { DBusBridge } from "./ipc/DBusBridge.js";
import { TileUtils } from "./core/TileUtils.js";
import { WindowRegistry } from "./core/WindowRegistry.js";
import { DirectionalEngine } from "./core/DirectionalEngine.js";

export function DirektorEngine() {


    this.closingWindows = new Set();
    this.initTimer = null;

    try {
        this._init();
    } catch (e) {
        print("[Direktor] FATAL ERROR IN _INIT: " + e);
    }
}
DirektorEngine.prototype._init = function() {
        print("[Direktor] Starting Wayland-First Tiling Manager for Plasma 6...");
        if (typeof Logger !== "undefined") Logger.info("Main", "Starting Wayland-First Tiling Manager for Plasma 6...");

        this.debugSteps = [];
        // 1. Initialize Subsystems
        this.configManager = new ConfigManager();
        this.debugSteps.push("ConfigManager");

        this.ruleEngine = new WindowRuleEngine(this.configManager);
        this.registry = new WindowRegistry(this);
        this.layoutManager = new LayoutManager(this);
        this.dbusBridge = new DBusBridge(this);
        this.directionalEngine = new DirectionalEngine(this);
        this.debugSteps.push("Engines");

        // Track tiled normal windows per monitor output name
        this.windowsByOutput = new Map();
        this.windowOrderMap = new Map(); // key -> KWin.Window[]
        this.closingWindows = new Set();
        this.animationDuration = 300;
        this.isPaused = false; // System animation duration wait (ms)

        // 2. Connect KWin Workspace Signals
        this.connectSignals();
        this.debugSteps.push("Signals");

        // 3. Register Global Keyboard Shortcuts
        this.registerShortcuts();
        this.debugSteps.push("Shortcuts");

        // 4. Initial Screen Setup & discover existing open windows
        const existing = TileUtils.getWorkspaceWindows();
        this.debugSteps.push("WindowsExtracted(" + existing.length + ")");
        if (typeof Logger !== "undefined") Logger.info("Main", "[Direktor API Check] Extracted " + existing.length + " existing windows from workspace.");
        for (let i = 0; i < existing.length; i++) {
            this.handleWindowAdded(existing[i]);
        }
        
        // Delay the initial retile by 300ms to guarantee KWin's workspace.screens array is fully populated after a script restart
        this.kwinSetTimeout(() => {
            this.retileAllScreens();
            this.debugSteps.push("Retiled");
            print("[Direktor] Successfully initialized. SUMMARY: " + this.debugSteps.join(" -> "));
        }, 300);
    }

DirektorEngine.prototype.kwinSetTimeout = function(func, delayMs) {
        if (typeof setTimeout === "function") {
            try {
                setTimeout(func, delayMs);
                return;
            } catch (e) {}
        }
        if (typeof QTimer === "function" && typeof QTimer.singleShot === "function") {
            try {
                QTimer.singleShot(delayMs, func);
                return;
            } catch (e) {}
        }
        try {
            const timer = new QTimer();
            timer.interval = delayMs;
            timer.singleShot = true;
            timer.timeout.connect(() => {
                try { func(); } catch (e) {}
            });
            timer.start();
            return;
        } catch (e) {}
        try {
            const timer = Qt.createQmlObject("import QtQuick 2.0; Timer {}", typeof scriptRoot !== "undefined" ? scriptRoot : null);
            if (timer) {
                const callback = () => {
                    try { timer.triggered.disconnect(callback); } catch (e) {}
                    try { func(); } catch (e) {}
                };
                timer.interval = delayMs;
                timer.repeat = false;
                timer.triggered.connect(callback);
                timer.start();
                return;
            }
        } catch (e) {}
        try { func(); } catch (e) {}
    }

DirektorEngine.prototype.swapWindowsInOrder = function(winA, winB) {
        if (!winA || !winB || winA === winB) return;
        const output = winA.output || workspace.activeScreen || workspace.screens[0];
        const currentDesktop = workspace.currentDesktop;
        if (output && this.layoutManager && typeof TileUtils !== "undefined") {
            const surfaceId = TileUtils.computeSurfaceId(output, currentDesktop);
            this.layoutManager.swapWindows(winA, winB, surfaceId, output);
        }
        for (const [key, list] of this.windowOrderMap.entries()) {
            const idxA = list.indexOf(winA);
            const idxB = list.indexOf(winB);
            if (idxA !== -1 && idxB !== -1) {
                list[idxA] = winB;
                list[idxB] = winA;
                break;
            }
        }
        const entryA = this.registry.getEntry(winA);
        const entryB = this.registry.getEntry(winB);
        if (entryA && entryB && typeof entryA.layoutPosition === "number" && typeof entryB.layoutPosition === "number") {
            const temp = entryA.layoutPosition;
            entryA.layoutPosition = entryB.layoutPosition;
            entryB.layoutPosition = temp;
        }
    }

DirektorEngine.prototype.promoteMaster = function(win = null) {
        const target = win || workspace.activeWindow;
        if (!target || !target.normalWindow) return;
        const output = target.output || workspace.activeScreen || workspace.screens[0];
        if (!output || this.isPaused) return;
        const currentDesktop = workspace.currentDesktop;
        const key = `${output.name}_${currentDesktop ? (currentDesktop.desktop || currentDesktop) : 'all'}`;
        let list = this.windowOrderMap.get(key);
        if (!list || list.length === 0) {
            for (const [k, l] of this.windowOrderMap.entries()) {
                if (l.includes(target)) {
                    list = l;
                    break;
                }
            }
        }
        if (list && list.length > 1) {
            const idx = list.indexOf(target);
            if (idx > 0) {
                const oldMaster = list[0];
                list[0] = target;
                list[idx] = oldMaster;
                const entryTarget = this.registry.getEntry(target);
                const entryOld = this.registry.getEntry(oldMaster);
                if (entryTarget && entryOld && typeof entryTarget.layoutPosition === "number" && typeof entryOld.layoutPosition === "number") {
                    const temp = entryTarget.layoutPosition;
                    entryTarget.layoutPosition = entryOld.layoutPosition;
                    entryOld.layoutPosition = temp;
                }
                print(`[Direktor] Promoted '${target.caption}' to master position (swapped with '${oldMaster.caption}')`);
                this._retileWindowDesktops(target);
            }
        }
    }

DirektorEngine.prototype.connectSignals = function() {
        const self = this;
        // Handle window activation for auto-scrolling layouts
        workspace.windowActivated.connect((window) => {
            if (window && window.output && window.normalWindow && !self.closingWindows.has(window)) {
                if (typeof TileUtils !== "undefined") {
                    const surfaceId = TileUtils.computeSurfaceId(window.output, workspace.currentDesktop);
                    const layoutId = self.layoutManager.getActiveLayoutId(surfaceId);
                    if (layoutId === "niri-scrollable") {
                        self._retileWindowDesktops(window);
                    }
                }
            }
        });

        // Intercept new windows added to the workspace
        workspace.windowAdded.connect((window) => {
            this.handleWindowAdded(window);
        });

        // Handle window removal (closed or moved away)
        workspace.windowRemoved.connect((window) => {
            this.handleWindowRemoved(window);
        });

        // Handle screen topology changes (hotplug, resolution change)
        workspace.screensChanged.connect(() => {
            print("[Direktor] Screen topology changed. Recomputing layouts...");
            this.retileAllScreens();
        });

        // Handle virtual desktop switching
        if (typeof workspace.currentDesktopChanged !== "undefined") {
            workspace.currentDesktopChanged.connect(() => {
                print("[Direktor] Virtual desktop changed. Retiling...");
                this.retileAllScreens();
            });
        }

        // Handle system settings options changes with differential window check
        try {
            if (typeof options !== "undefined" && options.configChanged) {
                options.configChanged.connect(() => {
                    console.log("[Direktor] Options changed in System Settings. Triggering normal hot-reload...");
                    self.reloadConfiguration(true);
                });
            }
        } catch (e) {}
    }

DirektorEngine.prototype.registerShortcuts = function() {
        const shortcuts = this.configManager.config.shortcuts || {};
        const self = this;

        registerShortcut(
            "direktor_toggle_floating",
            "Direktor: Toggle Float",
            shortcuts["toggle_floating"] || "Meta+Shift+F",
            function() { self.dbusBridge.triggerAction("toggle_floating"); }
        );

        registerShortcut(
            "direktor_toggle_desktop_isolation",
            "Direktor: Toggle Desktop Isolation (Per-Desktop Layouts)",
            shortcuts["toggle_desktop_isolation"] || "Meta+Shift+Space",
            function() { self.dbusBridge.triggerAction("toggle_desktop_isolation"); }
        );

        registerShortcut(
            "direktor_cycle_layout",
            "Direktor: Cycle Layout on Current Monitor",
            shortcuts["cycle_layout"] || "Meta+Space",
            function() { self.dbusBridge.triggerAction("cycle_layout"); }
        );

        registerShortcut(
            "direktor_toggle_desktop_isolation",
            "Direktor: Toggle Per-Desktop Layout Isolation",
            shortcuts["toggle_desktop_isolation"] || "Meta+Shift+Space",
            function() { self.dbusBridge.triggerAction("toggle_desktop_isolation"); }
        );

        registerShortcut(
            "direktor_promote_master",
            "Direktor: Promote Active Window to Master Position",
            shortcuts["promote_master"] || "Meta+Return",
            function() { self.dbusBridge.triggerAction("promote_master"); }
        );

        // Directional Focus Shortcuts
        registerShortcut("direktor_focus_left", "Direktor: Focus Left", shortcuts["focus_left"] || "Meta+Left", function() { self.dbusBridge.triggerAction("focus_left"); });
        registerShortcut("direktor_focus_right", "Direktor: Focus Right", shortcuts["focus_right"] || "Meta+Right", function() { self.dbusBridge.triggerAction("focus_right"); });
        registerShortcut("direktor_focus_up", "Direktor: Focus Up", shortcuts["focus_up"] || "Meta+Up", function() { self.dbusBridge.triggerAction("focus_up"); });
        registerShortcut("direktor_focus_down", "Direktor: Focus Down", shortcuts["focus_down"] || "Meta+Down", function() { self.dbusBridge.triggerAction("focus_down"); });

        // Directional Move Shortcuts
        registerShortcut("direktor_move_left", "Direktor: Move Focused Window Left", shortcuts["move_left"] || "Meta+Shift+Left", function() { self.dbusBridge.triggerAction("move_left"); });
        registerShortcut("direktor_move_right", "Direktor: Move Focused Window Right", shortcuts["move_right"] || "Meta+Shift+Right", function() { self.dbusBridge.triggerAction("move_right"); });
        registerShortcut("direktor_move_up", "Direktor: Move Focused Window Up", shortcuts["move_up"] || "Meta+Shift+Up", function() { self.dbusBridge.triggerAction("move_up"); });
        registerShortcut("direktor_move_down", "Direktor: Move Focused Window Down", shortcuts["move_down"] || "Meta+Shift+Down", function() { self.dbusBridge.triggerAction("move_down"); });

        // Dwindle Features Shortcuts
        registerShortcut("direktor_togglesplit", "Direktor: Toggle Dwindle Split Direction", shortcuts["togglesplit"] || "Meta+J", function() { self.dbusBridge.triggerAction("togglesplit"); });
        registerShortcut("direktor_pseudotile", "Direktor: Toggle Pseudo-Tiling Mode", shortcuts["pseudotile"] || "Meta+P", function() { self.dbusBridge.triggerAction("pseudotile"); });

        // Window Resize Shortcuts
        registerShortcut("direktor_increase_width", "Direktor: Increase Window Width", shortcuts["increase_width"] || "Meta+Ctrl+Right", function() { self.dbusBridge.triggerAction("increase_width"); });
        registerShortcut("direktor_decrease_width", "Direktor: Decrease Window Width", shortcuts["decrease_width"] || "Meta+Ctrl+Left", function() { self.dbusBridge.triggerAction("decrease_width"); });
        registerShortcut("direktor_increase_height", "Direktor: Increase Window Height", shortcuts["increase_height"] || "Meta+Ctrl+Up", function() { self.dbusBridge.triggerAction("increase_height"); });
        registerShortcut("direktor_decrease_height", "Direktor: Decrease Window Height", shortcuts["decrease_height"] || "Meta+Ctrl+Down", function() { self.dbusBridge.triggerAction("decrease_height"); });
        registerShortcut("direktor_reload_config", "Direktor: Hot-Reload Configuration", shortcuts["reload_config"] || "Meta+Shift+R", function() { self.reloadConfiguration(); });
        registerShortcut("direktor_toggle_pause", "Direktor: Pause Tiling Engine", shortcuts["toggle_pause"] || "Meta+Shift+P", function() { self.dbusBridge.triggerAction("toggle_pause"); });

        const customBindings = this.configManager.config.customBindings || [];
        for (let i = 0; i < customBindings.length; i++) {
            const cb = customBindings[i];
            try {
                registerShortcut(
                    cb.id,
                    cb.name,
                    "",
                    function() {
                        self.dbusBridge.triggerAction(cb.action);
                        if (cb.message) self.showNotification(cb.message);
                    }
                );
            } catch (e) {
                console.log(`[Direktor] Failed to register custom shortcut '${cb.name}': ${e}`);
            }
        }
    }

DirektorEngine.prototype.showNotification = function(text) {
        if (!text) return;
        print(`[INFO] [OSD] ${text}`);
        if (typeof console !== "undefined" && typeof console.warn === "function") {
            console.warn(`[INFO] [OSD] ${text}`);
        }
        if (typeof Logger !== "undefined" && typeof Logger.info === "function") {
            Logger.info("OSD", text);
        }
    }

DirektorEngine.prototype.connectWindowSignals = function(window) {
        if (!window || window._direktorConnected) return;
        window._direktorConnected = true;
        const self = this;

        const checkReEvaluate = () => {
            if (self.closingWindows.has(window) || !window.normalWindow) return;
            const entry = self.registry.getEntry(window);
            // If the window is no longer registered, do not evaluate it (it's dying)
            if (!entry) return;
            
            const newAction = self.ruleEngine.evaluateWindow(window);
            const currentState = entry.state;
            const targetState = newAction === "tile" ? "tiled" : (newAction === "float" ? "floating" : "ignored");
            
            if (targetState === "ignored" && currentState !== "ignored") {
                print(`[Direktor] Window properties updated (ignoring): ${window.resourceClass || window.caption}`);
                self.registry.setState(window, "ignored");
                TileUtils.untileWindow(window);
                const output = window.output || workspace.activeScreen || workspace.screens[0];
                self._retileWindowDesktops(window);
            } else if (targetState === "tiled" && currentState !== "tiled") {
                if (currentState === "ignored") {
                    print(`[Direktor] Grace Period: Window '${window.caption || window.resourceClass}' dropped ignore state. Waiting 1500ms...`);
                    window._direktorGraceUntil = Date.now() + 1500;
                    self.kwinSetTimeout(() => {
                        if (!window || self.closingWindows.has(window) || !window.normalWindow) return;
                        const reAction = self.ruleEngine.evaluateWindow(window);
                        const currentEntry = self.registry.getEntry(window);
                        if (reAction === "tile" && currentEntry && currentEntry.state !== "tiled") {
                            print(`[Direktor] Grace Period elapsed. Tiling window '${window.caption || window.resourceClass}'...`);
                            self.registry.setState(window, "tiled");
                            self._retileWindowDesktops(window);
                        } else {
                            print(`[Direktor] Grace Period aborted. Window '${window.caption || window.resourceClass}' re-asserted ignore state.`);
                        }
                    }, 1500);
                } else {
                    self.registry.setState(window, "tiled");
                    self._retileWindowDesktops(window);
                }
            } else if (targetState === "floating" && currentState !== "floating") {
                self.registry.setState(window, "floating");
                TileUtils.untileWindow(window);
                const output = window.output || workspace.activeScreen || workspace.screens[0];
                self._retileWindowDesktops(window);
            }
        };
        try { window.resourceClassChanged.connect(checkReEvaluate); } catch (e) {}
        try { window.captionChanged.connect(checkReEvaluate); } catch (e) {}
        try { window.fullScreenChanged.connect(checkReEvaluate); } catch (e) {}
        try { window.minimizedChanged.connect(() => { self._retileWindowDesktops(window); }); } catch (e) {}

        const onFinished = () => {
            if (self._isRetiling || self.isPaused) return;
            
            // Trailing debounce: wait until all KWin signals have finished firing to ensure we have the absolute final geometry
            window._direktorOnFinishedEpoch = Date.now();
            if (window._direktorOnFinishedTimer) return;
            window._direktorOnFinishedTimer = true;
            
            self.kwinSetTimeout(() => {
                window._direktorOnFinishedTimer = false;
                // Double-check if a newer signal was fired while we were waiting
                if (Date.now() - window._direktorOnFinishedEpoch < 40) {
                    onFinished();
                    return;
                }
                
                const output = window.output || workspace.activeScreen || workspace.screens[0];
                const surfaceId = TileUtils.computeSurfaceId(output, workspace.currentDesktop);
                if (self.layoutManager.getActiveLayoutId(surfaceId) === "floating") return; // Disable snapback for All Floating layout
                if (self.registry.getState(window) === "floating") return; // Disable snapback for explicitly floating windows
                const allWin = TileUtils.getWorkspaceWindows();
                const currentDesktop = workspace.currentDesktop;
                const windows = [];
                for (let i = 0; i < allWin.length; i++) {
                    const w = allWin[i];
                    if (w && w.normalWindow && !w.minimized && !self.closingWindows.has(w)) {
                        const entry = self.registry.getEntry(w);
                        const state = entry && entry.userOverridden ? entry.state : (self.ruleEngine.evaluateWindow(w) === "tile" ? "tiled" : "floating");
                        if (state === "tiled") {
                            const isOnScreen = TileUtils.isWindowOnScreen(w, output);
                            const isOnDesktop = TileUtils.isWindowOnDesktop(w, currentDesktop);
                            if (isOnScreen && isOnDesktop) windows.push(w);
                        }
                    }
                }
                const sortedWin = self.registry.sortWindows(windows, true);
                self.layoutManager.getActiveLayout(output).handleWindowInteractiveEvent(window, output, sortedWin, true);
                self._retileWindowDesktops(window);
            }, 50);
        };

        try { window.interactiveMoveResizeFinished.connect(onFinished); } catch (e) {}
        try {
            window.moveResizedChanged.connect(() => {
                if (window.resize || window.move || window.isInteractiveMoveResize) {
                    window._direktorResizing = true;
                } else if (window._direktorResizing) {
                    window._direktorResizing = false;
                    onFinished();
                }
            });
        } catch (e) {}
        try {
            window.frameGeometryChanged.connect(() => {
                if (self._isRetiling || self.isPaused) return;
                const output = window.output || workspace.activeScreen || workspace.screens[0];
                const allWin = TileUtils.getWorkspaceWindows();
                const currentDesktop = workspace.currentDesktop;
                const windows = [];
                for (let i = 0; i < allWin.length; i++) {
                    const w = allWin[i];
                    if (w && w.normalWindow && !w.minimized && !self.closingWindows.has(w)) {
                        const entry = self.registry.getEntry(w);
                        const state = entry && entry.userOverridden ? entry.state : (self.ruleEngine.evaluateWindow(w) === "tile" ? "tiled" : "floating");
                        if (state === "tiled") {
                            const isOnScreen = TileUtils.isWindowOnScreen(w, output);
                            const isOnDesktop = TileUtils.isWindowOnDesktop(w, currentDesktop);
                            if (isOnScreen && isOnDesktop) windows.push(w);
                        }
                    }
                }
                if (window._direktorResizing || window.isInteractiveMoveResize || window.interactiveMoveResizeStep) {
                    const sortedWin = self.registry.sortWindows(windows, true);
                    self.layoutManager.getActiveLayout(output).handleWindowInteractiveEvent(window, output, sortedWin, false);
                }
            });
        } catch (e) {}
    }

DirektorEngine.prototype._retileWindowDesktops = function(window) {
        if (!window || this.isPaused) return;
        const output = window.output || workspace.activeScreen || workspace.screens[0];
        if (!output) return;
        const desks = window.desktops && window.desktops.length > 0 ? Array.from(window.desktops) : [workspace.currentDesktop];
        for (let i = 0; i < desks.length; i++) {
            this.retileSurface(output, desks[i]);
        }
    }

    DirektorEngine.prototype.handleWindowAdded = function(window) {
        if (!window || !window.normalWindow || window.specialWindow || window.lockScreen || window.splash || window.onScreenDisplay || window.popupWindow || window.dock || window.fullScreen) {
            this.registry.register(window, "ignored");
            this.connectWindowSignals(window);
            return;
        }

        const action = this.ruleEngine.evaluateWindow(window);
        if (action === "ignore") {
            this.registry.register(window, "ignored");
            this.connectWindowSignals(window);
            return;
        }

        if (action === "float") {
            print(`[Direktor] Floating window matching rule: ${window.caption}`);
            this.registry.register(window, "floating");
            TileUtils.untileWindow(window);
            return;
        }

        // Action is "tile" - Krohnkite pattern: wait for windowShown so initial KWin placement/animation doesn't flash in middle of screen
        let handled = false;
        let wrapper = null;
        const handler = () => {
            if (handled || !window) return;
            handled = true;
            this.registry.register(window, "tiled");
            
            // Delayed Morphing Launch: wait for the KDE "Open" animation (Scale/Fade) to finish completely
            // before triggering the tile. Otherwise, Geometry Change is blocked and the window teleports.
            let launchDelay = 320;
            if (this.configManager && typeof this.configManager.getGeneralSettings === "function") {
                const gen = this.configManager.getGeneralSettings();
                if (typeof gen.morphingLaunchDelay === "number") {
                    launchDelay = gen.morphingLaunchDelay;
                } else if (typeof gen.animationDuration === "number") {
                    launchDelay = gen.animationDuration + 20;
                }
            }
            this.kwinSetTimeout(() => {
                if (window) this.tileWindow(window);
            }, launchDelay);
            
            try { if (wrapper && window.windowShown) window.windowShown.disconnect(wrapper); } catch (e) {}
        };

        try {
            if (typeof window.windowShown !== "undefined" && window.windowShown && typeof window.windowShown.connect === "function") {
                wrapper = window.windowShown.connect(handler);
            }
        } catch (e) {}
        this.kwinSetTimeout(handler, 20);
    }

DirektorEngine.prototype.handleWindowRemoved = function(window) {
        if (!window) return;
        const entry = this.registry.getEntry(window);
        if (!entry || (entry.state !== "tiled" && entry.state !== "floating")) {
            this.registry.unregister(window);
            return;
        }
        this.closingWindows.add(window);
        this.registry.unregister(window);
        const output = (window && window.output) ? window.output : (workspace.activeScreen || workspace.screens[0]);
        if (output) {
            const self = this;
            const delay = typeof this.animationDuration === "number" ? this.animationDuration : 300;
            this.kwinSetTimeout(() => {
                self.closingWindows.delete(window);
                self._retileWindowDesktops(window);
            }, delay);
        }
    }

DirektorEngine.prototype.tileWindow = function(window) {
        if (!window) return;
        this.registry.setState(window, "tiled");
        this.connectWindowSignals(window);
        const output = window.output || workspace.activeScreen || workspace.screens[0];
        if (output) {
            this._retileWindowDesktops(window);
        }

        // Wayland Startup Geometry Verification & Auto-Fallback Watchdog (Smart Listener)
        const self = this;
        let retries = 0;
        const maxRetries = self.configManager.config.general.watchdogMaxRetries || 20;
        const retryDelayMs = self.configManager.config.general.watchdogRetryDelayMs || 100;
        let resolved = false;
        let sigWrapper = null;

        const checkGeometryAndRetry = () => {
            if (resolved || !window || !window.normalWindow || self.closingWindows.has(window)) return;
            const entry = self.registry.getEntry(window);
            if (!entry || entry.state !== "tiled") return;

            // P0: Issue #2 fix - skip watchdog entirely if window went fullscreen or is in grace period
            if (window.fullScreen || (window._direktorGraceUntil && window._direktorGraceUntil > Date.now())) {
                resolved = true;
                if (sigWrapper && window.frameGeometryChanged) {
                    try { window.frameGeometryChanged.disconnect(sigWrapper); } catch (e) {}
                }
                return;
            }

            const fg = window.frameGeometry;
            const tr = window._direktorLastTargetRect;
            
            if (fg && tr && Math.abs(fg.width - tr.width) <= 35 && Math.abs(fg.height - tr.height) <= 35) {
                if (fg.width !== tr.width || fg.height !== tr.height || fg.x !== tr.x || fg.y !== tr.y) {
                    window.frameGeometry = tr;
                    print(`[Direktor Watchdog] Applied final pixel-perfect nudge for '${window.caption}'`);
                    
                    // If it's a width discrepancy (likely terminal cell stepping), record it for the layout engine
                    if (fg.width !== tr.width) {
                        window._direktorMinEffectiveWidth = fg.width;
                        self.kwinSetTimeout(() => self._retileWindowDesktops(window), 50);
                    }
                }
                print(`[Direktor Watchdog] Geometry perfectly verified for '${window.caption}' after ${retries} retries.`);
                resolved = true;
                if (sigWrapper && window.frameGeometryChanged) {
                    try { window.frameGeometryChanged.disconnect(sigWrapper); } catch (e) {}
                }
                return;
            }

            retries++;
            if (retries < maxRetries) {
                if (retries % 2 === 0) {
                    // Only retile occasionally to avoid spamming the compositor
                    self._retileWindowDesktops(window);
                }
                self.kwinSetTimeout(checkGeometryAndRetry, retryDelayMs);
            } else {
                resolved = true;
                if (sigWrapper && window.frameGeometryChanged) {
                    try { window.frameGeometryChanged.disconnect(sigWrapper); } catch (e) {}
                }
                print(`[Direktor Watchdog ${Math.round((maxRetries * retryDelayMs)/1000)}s] App '${window.caption}' refused tiled dimensions (likely hit Wayland minimum size constraints). Accepting its overlapping geometry and leaving it in the tile grid.`);
                if (typeof Logger !== "undefined") Logger.warn("Watchdog", `App '${window.caption}' refused tiled dimensions. Accepting overlap.`);
                // Tell the layout engine exactly how wide this stubborn window is, so it can wrap the column perfectly
                const fg = window.frameGeometry;
                if (fg && tr && fg.width > tr.width) {
                    window._direktorMinEffectiveWidth = fg.width;
                    self._retileWindowDesktops(window);
                }
            }
        };

        // Hook into signals for instant zero-latency verification when the app completes loading
        try {
            if (window.frameGeometryChanged && typeof window.frameGeometryChanged.connect === "function") {
                sigWrapper = window.frameGeometryChanged.connect(() => {
                    if (resolved) return;
                    const fg = window.frameGeometry;
                    const tr = window._direktorLastTargetRect;
                    if (fg && tr && Math.abs(fg.width - tr.width) <= 35 && Math.abs(fg.height - tr.height) <= 35) {
                        resolved = true;
                        if (fg.width !== tr.width || fg.height !== tr.height || fg.x !== tr.x || fg.y !== tr.y) {
                            window.frameGeometry = tr;
                            print(`[Direktor Watchdog] Signal applied final pixel-perfect nudge for '${window.caption}'`);
                        }
                        print(`[Direktor Watchdog] Signal resolved geometry instantly for '${window.caption}'`);
                        try { window.frameGeometryChanged.disconnect(sigWrapper); } catch (e) {}
                    }
                });
            }
        } catch (e) {}

        // Kick off the smart polling loop (100ms intervals)
        self.kwinSetTimeout(checkGeometryAndRetry, 100);
    }

DirektorEngine.prototype.toggleSplitDirection = function() {
        const basis = workspace.activeWindow;
        if (!basis || !basis.normalWindow) return;
        const output = basis.output || workspace.activeScreen || workspace.screens[0];
        const currentDesktop = workspace.currentDesktop;
        if (!output || !this.layoutManager || typeof TileUtils === "undefined") return;
        const surfaceId = TileUtils.computeSurfaceId(output, currentDesktop);
        const layoutId = this.layoutManager.getActiveLayoutId(surfaceId);
        const layoutEngine = this.layoutManager.getLayout(layoutId);
        if (layoutEngine && typeof layoutEngine.toggleSplitDirection === "function") {
            if (layoutEngine.toggleSplitDirection(basis, output)) {
                this._retileWindowDesktops(basis);
                this.showNotification("Toggled Split Direction");
            }
        } else {
            this.showNotification("Split toggle not supported on current layout");
        }
    }

DirektorEngine.prototype.togglePseudoTile = function() {
        const basis = workspace.activeWindow;
        if (!basis || !basis.normalWindow) return;
        basis._direktorPseudo = !basis._direktorPseudo;
        const output = basis.output || workspace.activeScreen || workspace.screens[0];
        if (output) {
            this._retileWindowDesktops(basis);
            this.showNotification(basis._direktorPseudo ? "Pseudo-Tiling Enabled" : "Pseudo-Tiling Disabled");
        }
    }

DirektorEngine.prototype.resizeActiveWindow = function(dir) {
        const basis = workspace.activeWindow;
        if (!basis || !basis.normalWindow) return;
        const step = (this.configManager.config.general && typeof this.configManager.config.general.resizeStep === "number") ? this.configManager.config.general.resizeStep : 40;
        const entry = this.registry ? this.registry.getEntry(basis) : null;
        let isFloating = entry ? (entry.state === "floating") : (basis.tile === null);
        if (!isFloating && this.layoutManager && typeof TileUtils !== "undefined") {
            const surfaceId = TileUtils.computeSurfaceId(basis.output, workspace.currentDesktop);
            if (this.layoutManager.getActiveLayoutId(surfaceId) === "floating") {
                isFloating = true;
            }
        }

        if (isFloating) {
            const fg = basis.frameGeometry;
            if (!fg) return;
            let nw = fg.width;
            let nh = fg.height;
            if (dir === "right") nw += step;
            if (dir === "left") nw = Math.max(100, nw - step);
            if (dir === "down") nh += step;
            if (dir === "up") nh = Math.max(100, nh - step);
            if (typeof TileUtils !== "undefined") {
                TileUtils.assignWindowRect(basis, { x: fg.x, y: fg.y, width: nw, height: nh });
            } else {
                basis.frameGeometry = { x: fg.x, y: fg.y, width: nw, height: nh };
            }
            print(`[Direktor] Resized floating window by ${step}px (${dir})`);
            return;
        }

        const output = basis.output || workspace.activeScreen || workspace.screens[0];
        const currentDesktop = workspace.currentDesktop;
        if (!output || !this.layoutManager || typeof TileUtils === "undefined") return;
        const surfaceId = TileUtils.computeSurfaceId(output, currentDesktop);
        const layoutId = this.layoutManager.getActiveLayoutId(surfaceId);
        const layoutEngine = this.layoutManager.getLayout(layoutId);
        if (layoutEngine && typeof layoutEngine.resizeWindow === "function") {
            if (layoutEngine.resizeWindow(basis, dir, step, output)) {
                this._retileWindowDesktops(basis);
            }
        } else {
            print(`[Direktor] Active layout ${layoutId} does not support directional ratio resizing.`);
        }
    }

DirektorEngine.prototype.retileSurface = function(output, desktop, ignoreWin = null) {
        if (!output || !desktop) return;
        const surfaceId = TileUtils.computeSurfaceId(output, desktop);
        
        if (!this._isRetilingSurface) this._isRetilingSurface = new Set();
        if (this._isRetilingSurface.has(surfaceId)) {
            return;
        }
        this._isRetilingSurface.add(surfaceId);
        
        try {
            this._retileSurfaceInternal(output, desktop, ignoreWin);
        } catch (e) {
            print(`[Direktor] CRASH in _retileSurfaceInternal: ${e}\n${e.stack}`);
        } finally {
            const self = this;
            this.kwinSetTimeout(() => {
                if (self._isRetilingSurface) self._isRetilingSurface.delete(surfaceId);
            }, 60);
        }
    }

DirektorEngine.prototype._retileSurfaceInternal = function(output, desktop, ignoreWin = null) {
        if (this.isPaused) return;
        if (!output || typeof output.name === "undefined") {
            output = workspace.activeScreen || (workspace.screens && workspace.screens.length > 0 ? workspace.screens[0] : null);
        }
        if (!output || !desktop) return;

        const outputName = output.name || "default";
        const surfaceId = TileUtils.computeSurfaceId(output, desktop);
        const allWin = TileUtils.getWorkspaceWindows();

        for (let i = 0; i < allWin.length; i++) {
            const w = allWin[i];
            if (w && (w.lockScreen || (typeof w.layer === "number" && w.layer === 10) || /kscreenlocker|sddm|greeter|lock.*screen|screen.*lock/i.test(`${w.resourceClass || ''} ${w.caption || ''} ${w.resourceName || ''} ${w.appId || ''} ${w.windowRole || ''} ${w.windowType || ''}`))) {
                print("[Direktor] Login/lock screen greeter detected. Operating in pure vanilla mode.");
                return;
            }
        }

        const windows = [];
        for (let i = 0; i < allWin.length; i++) {
            const w = allWin[i];
            if (!w || w === ignoreWin || !w.normalWindow || w.specialWindow || w.minimized || w.lockScreen || w.splash || w.dock || w.fullScreen || (typeof w.layer === "number" && w.layer !== 2) || this.closingWindows.has(w) || /kscreenlocker|sddm|greeter|lock.*screen|screen.*lock|polkit/i.test(`${w.resourceClass || ''} ${w.caption || ''} ${w.resourceName || ''} ${w.appId || ''} ${w.windowRole || ''} ${w.windowType || ''}`)) {
                // print("[Direktor] Initial filter skipped " + (w ? (w.caption || w.resourceClass) : "null") + " (normal: " + (w ? w.normalWindow : "") + ", special: " + (w ? w.specialWindow : "") + ", min: " + (w ? w.minimized : "") + ", layer: " + (w ? w.layer : "") + ")");
                continue;
            }
            const isOnScreen = TileUtils.isWindowOnScreen(w, output);
            const isOnDesktop = TileUtils.isWindowOnDesktop(w, desktop);
            if (!isOnScreen || !isOnDesktop) {
                // print("[Direktor] Filtered out window: isOnScreen=" + isOnScreen + ", isOnDesktop=" + isOnDesktop + " for desk: " + (desktop ? desktop.name : "null"));
                continue;
            }

            const entry = this.registry.getEntry(w);
            const state = entry && entry.userOverridden ? entry.state : (this.ruleEngine.evaluateWindow(w) === "tile" ? "tiled" : "floating");
            if (state === "tiled") {
                this.registry.register(w, "tiled");
                this.connectWindowSignals(w);
                windows.push(w);
            } else {
                this.registry.register(w, state);
                TileUtils.untileWindow(w);
            }
        }

        // print("[Direktor] retileSurface(" + surfaceId + "): applying layout to " + windows.length + " windows");
        // print("[Direktor] SANITY CHECK 1");

        let rootTile = null;
        try {
            if (typeof workspace.rootTile === "function") {
                rootTile = workspace.rootTile(output, desktop);
            }
        } catch (e) {}
        if (!rootTile && typeof workspace.tilingForScreen === "function") {
            const tm = workspace.tilingForScreen(output);
            if (tm) rootTile = tm.rootTile;
        }

        if (windows.length === 0) {
            const layoutId = this.layoutManager.getActiveLayoutId(surfaceId);
            const layoutEngine = this.layoutManager.getLayout(layoutId);
            if (layoutEngine && typeof layoutEngine.applyLayout === "function") {
                layoutEngine.applyLayout(rootTile, [], output);
            }
            return;
        }

        const padding = this.configManager.getGeneralSettings().padding || 8;
        if (rootTile) {
            try { rootTile.padding = padding; } catch (e) {}
        }
        const tileObj = rootTile || { padding: padding };

        let ordered = this.windowOrderMap.get(surfaceId) || [];
        ordered = ordered.filter(w => windows.includes(w));
        for (let i = 0; i < windows.length; i++) {
            if (!ordered.includes(windows[i])) {
                ordered.push(windows[i]);
            }
        }
        ordered.sort((a, b) => {
            const entryA = this.registry.getEntry(a);
            const entryB = this.registry.getEntry(b);
            const posA = entryA ? (typeof entryA.layoutPosition === "number" ? entryA.layoutPosition : entryA.absoluteOrder) : 9999;
            const posB = entryB ? (typeof entryB.layoutPosition === "number" ? entryB.layoutPosition : entryB.absoluteOrder) : 9999;
            return posA - posB;
        });
        this.windowOrderMap.set(surfaceId, ordered);

        const isCurrentDesktop = (desktop.id === workspace.currentDesktop.id || desktop.name === workspace.currentDesktop.name);
        if (!isCurrentDesktop) {
            print("[Direktor] Surface " + surfaceId + " is a background desktop. Deferring layout rendering until focused.");
            return;
        }

        const layoutId = this.layoutManager.getActiveLayoutId(surfaceId);
        const layoutEngine = this.layoutManager.getLayout(layoutId);
        // print(`[Direktor] Layout execution check: layoutId='${layoutId}', layoutEngineExists=${!!layoutEngine}`);
        if (layoutEngine && typeof layoutEngine.applyLayout === "function") {
            try {
                layoutEngine.applyLayout(rootTile, ordered, output, surfaceId);
            } catch (e) {
                print(`[Direktor] ERROR calling applyLayout: ${e}\n${e.stack}`);
            }
            for (const w of ordered) {
                if (w) w._lastDirektorLayout = layoutId;
            }
        } else {
            print(`[Direktor] WARNING: No valid layout engine found for ${layoutId}`);
        }
    }

DirektorEngine.prototype.retileScreen = function(output, ignoreWin = null) {
        if (!output) {
            output = workspace.activeScreen || (workspace.screens && workspace.screens.length > 0 ? workspace.screens[0] : null);
        }
        if (!output) return;
        this.retileSurface(output, workspace.currentDesktop, ignoreWin);
    }

DirektorEngine.prototype.retileAllScreens = function() {
        if (workspace.screens) {
            for (let i = 0; i < workspace.screens.length; i++) {
                this.retileScreen(workspace.screens[i]);
            }
        } else {
            this.retileScreen(null);
        }
    }

DirektorEngine.prototype.retileAll = function() {
        if (workspace.screens && workspace.desktops) {
            for (let i = 0; i < workspace.screens.length; i++) {
                for (let j = 0; j < workspace.desktops.length; j++) {
                    this.retileSurface(workspace.screens[i], workspace.desktops[j]);
                }
            }
        } else {
            this.retileAllScreens();
        }
    }

DirektorEngine.prototype.cycleLayout = function() {
        if (this.isPaused) {
            this.showNotification("Engine Paused (Layout Locked)");
            return;
        }
        if (!workspace.activeScreen || !workspace.currentDesktop) return;
        const surfaceId = TileUtils.computeSurfaceId(workspace.activeScreen, workspace.currentDesktop);
        const nextLayout = this.layoutManager.cycleNextLayout(surfaceId);
        this.showNotification(`Layout: ${nextLayout.name}`);
        this.retileSurface(workspace.activeScreen, workspace.currentDesktop);
    }

DirektorEngine.prototype.reloadConfiguration = function(force = true) {
        print("[Direktor] Executing supercharged hot-reload of all configurations and window rules...");
        const res = this.configManager.reloadFromKWin(force);
        this.registerShortcuts();
        this.animationDuration = this.configManager.getGeneralSettings().animationDuration || 300;

        // Reload layout specific external configs
        if (this.layoutManager && this.layoutManager.engines) {
            this.layoutManager.engines.forEach(engine => {
                if (engine && typeof engine._loadDwindleConfig === "function") {
                    engine._loadDwindleConfig();
                }
            });
        }

        // Re-evaluate every open window across all screens against updated rules and ignore lists
        const allWin = TileUtils.getWorkspaceWindows();
        const affectedOutputs = new Set();
        for (let i = 0; i < allWin.length; i++) {
            const w = allWin[i];
            if (!w || !w.normalWindow || w.specialWindow || w.lockScreen || w.splash || w.dock || w.fullScreen) continue;
            const action = this.ruleEngine.evaluateWindow(w);
            const currentState = this.registry.getState(w);
            const isCurrentlyTiled = (currentState === "tiled");

            if (action === "ignore" || action === "float") {
                if (isCurrentlyTiled) {
                    print(`[Direktor] Hot-reload: untiling window '${w.caption || w.resourceClass}' (${action})`);
                    this.registry.setState(w, action === "float" ? "floating" : "ignored");
                    TileUtils.untileWindow(w);
                    if (w.output) affectedOutputs.add(w.output);
                }
            } else if (action === "tile") {
                if (!isCurrentlyTiled && !w.minimized && !this.closingWindows.has(w)) {
                    print(`[Direktor] Hot-reload: tiling window '${w.caption || w.resourceClass}'`);
                    this.registry.setState(w, "tiled");
                    if (w.output) affectedOutputs.add(w.output);
                }
            }
        }

        if (affectedOutputs.size > 0) {
            affectedOutputs.forEach(output => this.retileScreen(output));
        } else {
            this.retileAllScreens();
        }
        if (typeof Logger !== "undefined") {
            Logger.info("Config", "Supercharged hot-reload completed successfully.");
            Logger.dumpToFile();
            try {
                if (typeof KWin !== "undefined" && typeof KWin.writeConfig === "function") {
                    KWin.writeConfig("lastLogSummary", Logger.getLogsText(300));
                }
            } catch (e) {}
        }
        this.showNotification("Direktor Configuration Hot-Reloaded");
    }

// Exported start function for QML declarative entrypoint (ui/main.qml)
export function startDirektor(api) {
    api = api || {};
    print("[Direktor] Starting engine via startDirektor...");
    console.warn("[Direktor] Starting engine via startDirektor...");

    var ws = api.workspace || (typeof Workspace !== "undefined" ? Workspace : (typeof workspace !== "undefined" ? workspace : null));
    var kw = api.kwin || (typeof KWin !== "undefined" ? KWin : null);

    if (ws) {
        if (typeof workspace !== "undefined") workspace = ws;
        if (typeof Workspace !== "undefined") Workspace = ws;
        if (typeof globalThis !== "undefined") {
            globalThis.workspace = ws;
            globalThis.Workspace = ws;
        }
        ws._direktorPopup = api.popupDialog;
        ws._direktorMakeQRect = function(x, y, w, h) {
            if (typeof Qt !== "undefined" && typeof Qt.rect === "function") return Qt.rect(x, y, w, h);
            return { x: x, y: y, width: w, height: h };
        };
    }
    if (kw) {
        if (typeof KWin !== "undefined") KWin = kw;
        if (typeof globalThis !== "undefined") globalThis.KWin = kw;
    }
    if (api.registerShortcut) {
        if (typeof registerShortcut !== "undefined") registerShortcut = api.registerShortcut;
        if (typeof globalThis !== "undefined") globalThis.registerShortcut = api.registerShortcut;
    }
    if (api.registerScreenEdge) {
        if (typeof registerScreenEdge !== "undefined") registerScreenEdge = api.registerScreenEdge;
        if (typeof globalThis !== "undefined") globalThis.registerScreenEdge = api.registerScreenEdge;
    }
    if (typeof assert !== "undefined" && typeof assert !== "function") {
        const assertFn = function(cond, msg) { if (!cond) throw new Error(msg || "Assertion failed"); };
        assert = assertFn;
        if (typeof globalThis !== "undefined") globalThis.assert = assertFn;
    }

    var instance = new DirektorEngine();
    if (ws) ws._direktorEngine = instance;
    if (typeof Workspace !== "undefined") Workspace._direktorEngine = instance;
    if (typeof workspace !== "undefined") workspace._direktorEngine = instance;
    if (typeof globalThis !== "undefined") globalThis._direktorEngine = instance;
    return instance;
}
