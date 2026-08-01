/**
 * ============================================================================
 * Direktor: D-Bus & IPC Action Bridge
 * ============================================================================
 * Solves Plasma 6 KWin sandbox limitations by providing an action dispatcher
 * (`triggerAction`) that can be invoked via D-Bus (`org.kde.kwin.direktor`),
 * QML overlays, or `workspace.registerShortcut()`.
 */

import { TileUtils } from "../core/TileUtils.js";

export class DBusBridge {
    /**
     * @param {Object} direktorEngine Reference to main Direktor engine instance
     */
    constructor(direktorEngine) {
        this.engine = direktorEngine;
        this.actionHandlers = new Map();
        this.registerDefaultActions();
    }

    registerDefaultActions() {
        // Toggle floating state of currently active window and update ignore list via WindowRegistry
        this.registerAction("toggle_floating", () => {
            const activeWin = workspace.activeWindow;
            if (!activeWin || !activeWin.normalWindow) return;
            const res = this.engine.registry && typeof this.engine.registry.toggleFloating === "function" ?
                this.engine.registry.toggleFloating(activeWin) : null;
            if (res) {
                const output = activeWin.output || workspace.activeScreen || workspace.screens[0];
                if (output && typeof this.engine.retileScreen === "function") {
                    this.engine.retileScreen(output);
                }
                if (typeof this.engine.showNotification === "function") {
                    const stateStr = res.newState === "floating" ? "Floating" : "Tiled";
                    this.engine.showNotification(`${stateStr}: ${res.caption || res.cls}`);
                }
            }
        });

        // Cycle layout on current screen output
        this.registerAction("cycle_layout", () => {
            if (this.engine && typeof this.engine.cycleLayout === "function") {
                this.engine.cycleLayout();
            }
        });

        // Toggle Per-Desktop Isolation mode
        this.registerAction("toggle_desktop_isolation", () => {
            TileUtils.perDesktopIsolation = !TileUtils.perDesktopIsolation;
            if (this.engine && typeof this.engine.showNotification === "function") {
                this.engine.showNotification(TileUtils.perDesktopIsolation ? "Layout Memory: Per Virtual Desktop" : "Layout Memory: Entire Monitor");
            }
            if (this.engine && typeof this.engine.retileAll === "function") {
                this.engine.retileAll();
            }
        });

        // Promote active window to master position
        this.registerAction("promote_master", () => {
            if (this.engine && typeof this.engine.promoteMaster === "function") {
                this.engine.promoteMaster();
            }
        });

        // Directional Focus (with strict monitor/desktop boundary enforcement and tie-breaking)
        this.registerAction("focus_left", () => { if (this.engine && this.engine.directionalEngine) this.engine.directionalEngine.focusDirection("left"); });
        this.registerAction("focus_right", () => { if (this.engine && this.engine.directionalEngine) this.engine.directionalEngine.focusDirection("right"); });
        this.registerAction("focus_up", () => { if (this.engine && this.engine.directionalEngine) this.engine.directionalEngine.focusDirection("up"); });
        this.registerAction("focus_down", () => { if (this.engine && this.engine.directionalEngine) this.engine.directionalEngine.focusDirection("down"); });

        // Directional Move / Swap
        this.registerAction("move_left", () => { if (this.engine && this.engine.directionalEngine) this.engine.directionalEngine.moveDirection("left"); });
        this.registerAction("move_right", () => { if (this.engine && this.engine.directionalEngine) this.engine.directionalEngine.moveDirection("right"); });
        this.registerAction("move_up", () => { if (this.engine && this.engine.directionalEngine) this.engine.directionalEngine.moveDirection("up"); });
        this.registerAction("move_down", () => { if (this.engine && this.engine.directionalEngine) this.engine.directionalEngine.moveDirection("down"); });

        this.registerAction("togglesplit", () => { if (this.engine && typeof this.engine.toggleSplitDirection === "function") this.engine.toggleSplitDirection(); });
        this.registerAction("pseudotile", () => { if (this.engine && typeof this.engine.togglePseudoTile === "function") this.engine.togglePseudoTile(); });
        this.registerAction("increase_width", () => { if (this.engine && typeof this.engine.resizeActiveWindow === "function") this.engine.resizeActiveWindow("right"); });
        this.registerAction("decrease_width", () => { if (this.engine && typeof this.engine.resizeActiveWindow === "function") this.engine.resizeActiveWindow("left"); });
        this.registerAction("increase_height", () => { if (this.engine && typeof this.engine.resizeActiveWindow === "function") this.engine.resizeActiveWindow("down"); });
        this.registerAction("decrease_height", () => { if (this.engine && typeof this.engine.resizeActiveWindow === "function") this.engine.resizeActiveWindow("up"); });

        this.registerAction("toggle_pause", () => {
            if (this.engine) {
                this.engine.isPaused = !this.engine.isPaused;
                if (typeof this.engine.showNotification === "function") {
                    this.engine.showNotification(this.engine.isPaused ? "Tiling Engine: Paused" : "Tiling Engine: Resumed");
                }
                if (!this.engine.isPaused && typeof this.engine.retileAllScreens === "function") {
                    this.engine.retileAllScreens();
                }
            }
        });

        // Explicitly set layout for current screen
        this.registerAction("set_layout", (layoutId) => {
            const activeWin = workspace.activeWindow;
            const output = activeWin ? activeWin.output : workspace.screens[0];
            const currentDesktop = workspace.currentDesktop;
            if (!output || !layoutId) return;
            const surfaceId = TileUtils.computeSurfaceId(output, currentDesktop);
            this.engine.layoutManager.setActiveLayoutId(surfaceId, layoutId);
            this.engine.retileSurface(output, currentDesktop);
        });

        // Adjust gap padding live
        this.registerAction("set_padding", (paddingVal) => {
            const pad = Number(paddingVal);
            if (isNaN(pad)) return;
            this.engine.configManager.config.general.padding = pad;
            this.engine.retileAllScreens();
        });

        // Reload configuration from disk/storage
        this.registerAction("reload_config", () => {
            print("[DBusBridge] Reloading JSON configuration...");
            this.engine.reloadConfiguration();
        });

        // Dump in-memory ring buffer logs to ~/.config/direktor/log.txt
        this.registerAction("dump_logs", () => {
            if (typeof Logger !== "undefined") {
                Logger.dumpToFile();
                if (typeof this.engine.showNotification === "function") {
                    this.engine.showNotification("Direktor Logs Dumped to ~/.config/direktor/log.txt");
                }
            }
        });
    }

    registerAction(actionName, handler) {
        this.actionHandlers.set(actionName, handler);
    }

    /**
     * Entry point invoked when a D-Bus method call `triggerAction(actionName, arg)` is received.
     * @param {string} actionName
     * @param {string} [arg]
     */
    triggerAction(actionName, arg) {
        const handler = this.actionHandlers.get(actionName);
        if (handler) {
            try {
                return handler(arg);
            } catch (err) {
                print(`[DBusBridge] Error executing action '${actionName}': ${err}`);
            }
        } else {
            print(`[DBusBridge] Unknown action requested: '${actionName}'`);
        }
    }
}
