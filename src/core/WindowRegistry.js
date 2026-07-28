/**
 * ============================================================================
 * Direktor: Centralized Window Registry & State Manager
 * ============================================================================
 * Acts as the authoritative source of truth for all windows managed by Direktor.
 * Tracks explicit state ("tiled", "floating", "ignored"), floating geometry,
 * and user overrides (such as Meta+Shift+F toggles).
 */

import { TileUtils } from "./TileUtils.js";

export class WindowRegistry {
    /**
     * @param {Object} engine Reference to main DirektorEngine instance
     */
    constructor(engine) {
        this.engine = engine;
        // Map keyed by KWin.Window surface to WindowState object
        this.windows = new Map();
        this.nextAbsoluteOrder = 1;
    }

    /**
     * Registers a newly observed window or updates its state.
     * @param {KWin.Window} window 
     * @param {"tiled" | "floating" | "ignored"} state 
     * @returns {Object} The registered WindowState entry
     */
    register(window, state = "tiled") {
        if (!window) return null;

        let entry = this.windows.get(window);
        if (!entry) {
            const cls = window.resourceClass || window.resourceName || "";
            const caption = window.caption || "";
            let floatingGeometry = null;
            try {
                if (window.frameGeometry && window.frameGeometry.width > 0) {
                    floatingGeometry = {
                        x: window.frameGeometry.x,
                        y: window.frameGeometry.y,
                        width: window.frameGeometry.width,
                        height: window.frameGeometry.height
                    };
                }
            } catch (e) {}

            const order = this.nextAbsoluteOrder++;
            entry = {
                window: window,
                id: window.internalId || cls + "_" + Date.now(),
                resourceClass: cls,
                caption: caption,
                state: state,
                floatingGeometry: floatingGeometry,
                userOverridden: false,
                absoluteOrder: order,
                layoutPosition: order
            };
            this.windows.set(window, entry);
            if (typeof Logger !== "undefined") {
                Logger.info("Registry", `Registered window: '${caption}' (${cls}) -> ${state.toUpperCase()} [absOrder: #${order}]`);
            } else {
                print(`[Direktor WindowRegistry] Registered new window: '${caption}' (class: ${cls}) -> state: ${state.toUpperCase()} [absOrder: #${order}]`);
            }
        } else if (!entry.userOverridden) {
            entry.state = state;
            if (window.resourceClass || window.resourceName) {
                entry.resourceClass = window.resourceClass || window.resourceName;
            }
            if (window.caption) {
                entry.caption = window.caption;
            }
        }
        return entry;
    }

    /**
     * Removes a closed or unmanaged window from the registry.
     * @param {KWin.Window} window 
     */
    unregister(window) {
        if (!window) return;
        const entry = this.windows.get(window);
        if (entry) {
            if (typeof Logger !== "undefined") {
                Logger.info("Registry", `Unregistered window: '${entry.caption || entry.resourceClass}'`);
            } else {
                print(`[Direktor WindowRegistry] Unregistered window: '${entry.caption || entry.resourceClass}'`);
            }
            this.windows.delete(window);
        }
    }

    /**
     * Retrieves the authoritative state for a window.
     * @param {KWin.Window} window 
     * @returns {"tiled" | "floating" | "ignored"}
     */
    getState(window) {
        if (!window) return "ignored";
        const entry = this.windows.get(window);
        return entry ? entry.state : "ignored";
    }

    /**
     * Sorts a list of KWin windows by secondary layout position or absolute creation order.
     * @param {KWin.Window[]} windows
     * @param {boolean} useLayoutPosition
     * @returns {KWin.Window[]}
     */
    sortWindows(windows, useLayoutPosition = true) {
        if (!windows || windows.length <= 1) return windows;
        return windows.slice().sort((a, b) => {
            const entryA = this.getEntry(a);
            const entryB = this.getEntry(b);
            const orderA = entryA ? (useLayoutPosition && typeof entryA.layoutPosition === "number" ? entryA.layoutPosition : entryA.absoluteOrder) : 999999;
            const orderB = entryB ? (useLayoutPosition && typeof entryB.layoutPosition === "number" ? entryB.layoutPosition : entryB.absoluteOrder) : 999999;
            if (orderA !== orderB) return orderA - orderB;
            const absA = entryA && typeof entryA.absoluteOrder === "number" ? entryA.absoluteOrder : 999999;
            const absB = entryB && typeof entryB.absoluteOrder === "number" ? entryB.absoluteOrder : 999999;
            return absA - absB;
        });
    }

    /**
     * Retrieves the full entry object for a window.
     * @param {KWin.Window} window 
     * @returns {Object | null}
     */
    getEntry(window) {
        if (!window) return null;
        return this.windows.get(window) || null;
    }

    /**
     * Updates the state of a registered window explicitly.
     * @param {KWin.Window} window 
     * @param {"tiled" | "floating" | "ignored"} newState 
     * @param {boolean} userOverridden 
     */
    setState(window, newState, userOverridden = false) {
        let entry = this.windows.get(window);
        if (!entry) {
            entry = this.register(window, newState);
        } else {
            entry.state = newState;
        }
        if (userOverridden) {
            entry.userOverridden = true;
        }
    }

    /**
     * Toggles a window between "tiled" and "floating" state, restoring previous
     * free-floating geometry if available, and auto-syncing with Direktor's ignore list.
     * @param {KWin.Window} window 
     * @returns {Object | null} Result summary of toggle operation
     */
    toggleFloating(window) {
        if (!window || !window.normalWindow) return null;

        let entry = this.windows.get(window);
        if (!entry) {
            entry = this.register(window, "tiled");
        }

        const oldState = entry.state;
        const cls = entry.resourceClass || window.resourceClass || window.resourceName || "";
        const caption = entry.caption || window.caption || "";
        const rulesConfig = this.engine.configManager.config.rulesConfig;

        if (oldState === "tiled") {
            // Switch from Tiled -> Floating
            entry.state = "floating";
            entry.userOverridden = true;
            print(`[Direktor WindowRegistry] Toggling '${caption}' (class: ${cls}): TILED -> FLOATING`);
            if (typeof Logger !== "undefined") Logger.info("Registry", `Toggling '${caption}' (${cls}): TILED -> FLOATING`);

            TileUtils.untileWindow(window);
            try {
                TileUtils.centerAndOptimizeFloatingWindow(window, entry.floatingGeometry);
            } catch (e) {}

            return { oldState: "tiled", newState: "floating", caption, cls };
        } else {
            // Switch from Floating/Ignored -> Tiled
            entry.state = "tiled";
            entry.userOverridden = true;
            print(`[Direktor WindowRegistry] Toggling '${caption}' (class: ${cls}): FLOATING -> TILED`);
            if (typeof Logger !== "undefined") Logger.info("Registry", `Toggling '${caption}' (${cls}): FLOATING -> TILED`);

            // Save current floating geometry before tiling so we can float back later
            try {
                if (window.frameGeometry && window.frameGeometry.width > 0) {
                    entry.floatingGeometry = {
                        x: window.frameGeometry.x,
                        y: window.frameGeometry.y,
                        width: window.frameGeometry.width,
                        height: window.frameGeometry.height
                    };
                }
            } catch (e) {}

            // Tile the window immediately
            this.engine.tileWindow(window);
            return { oldState: oldState, newState: "tiled", caption, cls };
        }
    }

    saveIgnoreClassesToConfig(key, valueStr) {
        if (!key || (!valueStr && valueStr !== "")) return;
        print(`[Direktor] Persisting ${key} directly to kwinrc ([Script-org.kde.kwin.direktor]): ${valueStr}`);
        try {
            if (typeof options !== "undefined") options[key] = valueStr;
        } catch (e) {}

        // Update in-memory rulesConfig
        let rulesConfig = null;
        if (this.engine && this.engine.configManager && this.engine.configManager.config) {
            rulesConfig = this.engine.configManager.config.rulesConfig;
            if (rulesConfig) rulesConfig[key] = valueStr;
        }

        try {
            if (typeof KWin !== "undefined" && typeof KWin.writeConfig === "function") {
                KWin.writeConfig(key, valueStr);
            }
        } catch (e) {
            print(`[Direktor] Error updating config: ${e}`);
        }
    }
}
