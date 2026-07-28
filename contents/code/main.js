// Direktor KWin Plasma 6 Script Bundle

// --- Module: src/core/TileUtils.js ---
/**
 * ============================================================================
 * Direktor Core: Tile Tree Manipulation Utilities (Plasma 6 / Wayland)
 * ============================================================================
 * Provides robust abstractions over KWin's native C++ `TileManager` and `Tile`
 * nodes (`workspace.tilingForScreen(output)`).
 *
 * In Wayland, windows do not use global x/y coordinates. Instead, layout
 * engines modify the `Tile` tree and assign `window.tile = targetTile`.
 */

const DIRECTION_HORIZONTAL = 0; // Left | Right side-by-side split
const DIRECTION_VERTICAL = 1;   // Top / Bottom stack split

class TileUtils {
    /**
     * Splits a tile into two child tiles along the given direction.
     * @param {KWin.Tile} tile Target tile to split
     * @param {number} direction DIRECTION_HORIZONTAL (0) or DIRECTION_VERTICAL (1)
     */
    static splitTile(tile, direction) {
        if (!tile) return;
        tile.split(direction);
    }

    /**
     * Collects all leaf tiles (tiles with no children) under a root or parent tile.
     * @param {KWin.Tile} tile Root or parent tile
     * @returns {KWin.Tile[]} Array of leaf tiles
     */
    static getLeafTiles(tile) {
        if (!tile) return [];
        if (!tile.isLayout || !tile.childTiles || tile.childTiles.length === 0) {
            return [tile];
        }

        const leaves = [];
        for (const child of tile.childTiles) {
            const childLeaves = TileUtils.getLeafTiles(child);
            for (let i = 0; i < childLeaves.length; i++) {
                leaves.push(childLeaves[i]);
            }
        }
        return leaves;
    }

    /**
     * Resets a root tile by removing all child splits so layout engines can rebuild cleanly.
     * @param {KWin.Tile} rootTile
     */
    static resetRootTile(rootTile) {
        if (!rootTile || !rootTile.childTiles) return;
        // In KWin Plasma 6, removing child tiles or resetting can be done by iteratively
        // removing children or re-initializing the root tile structure.
        while (rootTile.childTiles.length > 0) {
            const child = rootTile.childTiles[rootTile.childTiles.length - 1];
            if (typeof rootTile.removeChild === "function") {
                rootTile.removeChild(child);
            } else {
                break;
            }
        }
    }

    /**
     * Safe assignment of a window to a specific tile node.
     * Setting `window.tile = null` untiles/floats the window.
     * @param {KWin.Window} window
     * @param {KWin.Tile|null} tile
     */
    static assignWindowToTile(window, tile) {
        if (!window || !window.normalWindow) return;
        if (window.tile !== tile) {
            window.tile = tile;
        }
        if (tile && tile.absoluteGeometry) {
            window.frameGeometry = tile.absoluteGeometry;
        }
    }

    /**
     * Floats a window by detaching it from any KWin tile.
     * @param {KWin.Window} window
     */
    static untileWindow(window) {
        if (!window) return;
        if (window.tile !== null) {
            window.tile = null;
        }
    }

    static getUsableArea(output, sampleWin) {
        const maximizeOpt = (typeof KWin !== "undefined" && typeof KWin.MaximizeArea !== "undefined") ? KWin.MaximizeArea : 4;
        if (sampleWin) {
            try {
                const area = workspace.clientArea(maximizeOpt, sampleWin);
                if (area && area.width > 100 && area.height > 100) return area;
            } catch (e) {}
        }
        if (output) {
            try {
                const area = workspace.clientArea(maximizeOpt, output, workspace.currentDesktop);
                if (area && area.width > 100 && area.height > 100) return area;
            } catch (e) {}
        }
        return (output && output.geometry) ? output.geometry : { x: 0, y: 0, width: 1920, height: 1080 };
    }

    static assignWindowRect(window, rect) {
        if (!window || !rect) return;
        if (window.tile !== null) {
            window.tile = null;
        }

        let w = Math.max(100, rect.width);
        let h = Math.max(100, rect.height);

        if (window.minSize) {
            if (typeof window.minSize.width === "number" && window.minSize.width > 0) {
                w = Math.max(w, window.minSize.width);
            }
            if (typeof window.minSize.height === "number" && window.minSize.height > 0) {
                h = Math.max(h, window.minSize.height);
            }
        }
        if (window.maxSize) {
            if (typeof window.maxSize.width === "number" && window.maxSize.width > 0 && window.maxSize.width >= w) {
                w = Math.min(w, window.maxSize.width);
            }
            if (typeof window.maxSize.height === "number" && window.maxSize.height > 0 && window.maxSize.height >= h) {
                h = Math.min(h, window.maxSize.height);
            }
        }

        window.frameGeometry = {
            x: rect.x,
            y: rect.y,
            width: w,
            height: h
        };
    }

    /**
     * Determines whether a tile's aspect ratio favors a horizontal or vertical split.
     * Useful for Dwindle layouts.
     * @param {KWin.Tile} tile
     * @returns {number} DIRECTION_HORIZONTAL or DIRECTION_VERTICAL
     */
    static getLongestEdgeDirection(tile) {
        if (!tile || !tile.relativeGeometry) return DIRECTION_HORIZONTAL;
        const geom = tile.relativeGeometry;
        return geom.width >= geom.height ? DIRECTION_HORIZONTAL : DIRECTION_VERTICAL;
    }
}

// --- Module: src/core/WindowRegistry.js ---
/**
 * ============================================================================
 * Direktor: Centralized Window Registry & State Manager
 * ============================================================================
 * Acts as the authoritative source of truth for all windows managed by Direktor.
 * Tracks explicit state ("tiled", "floating", "ignored"), floating geometry,
 * and user overrides (such as Meta+Shift+F toggles).
 */


class WindowRegistry {
    /**
     * @param {Object} engine Reference to main DirektorEngine instance
     */
    constructor(engine) {
        this.engine = engine;
        // Map keyed by KWin.Window surface to WindowState object
        this.windows = new Map();
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

            entry = {
                window: window,
                id: window.internalId || cls + "_" + Date.now(),
                resourceClass: cls,
                caption: caption,
                state: state,
                floatingGeometry: floatingGeometry,
                userOverridden: false
            };
            this.windows.set(window, entry);
            print(`[Direktor WindowRegistry] Registered new window: '${caption}' (class: ${cls}) -> state: ${state.toUpperCase()}`);
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
            print(`[Direktor WindowRegistry] Unregistered window: '${entry.caption || entry.resourceClass}'`);
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

            TileUtils.untileWindow(window);
            if (entry.floatingGeometry) {
                try {
                    window.frameGeometry = entry.floatingGeometry;
                } catch (e) {}
            }

            // Persist class to ignoreClasses
            if (cls && rulesConfig && typeof rulesConfig.ignoreClasses === "string") {
                const classes = rulesConfig.ignoreClasses.split(",").map(s => s.trim()).filter(Boolean);
                if (!classes.includes(cls)) {
                    classes.push(cls);
                    rulesConfig.ignoreClasses = classes.join(",");
                    print(`[Direktor WindowRegistry] Appended '${cls}' to ignoreClasses.`);
                    try {
                        if (typeof callDBus === "function") {
                            callDBus("org.kde.kwriteconfig", "/kwriteconfig", "org.kde.kwriteconfig", "writeEntry", "kwinrc", "Script-org.kde.kwin.direktor", "ignoreClasses", rulesConfig.ignoreClasses);
                        }
                    } catch (e) {}
                }
            }

            return { oldState: "tiled", newState: "floating", caption, cls };
        } else {
            // Switch from Floating/Ignored -> Tiled
            entry.state = "tiled";
            entry.userOverridden = true;
            print(`[Direktor WindowRegistry] Toggling '${caption}' (class: ${cls}): FLOATING -> TILED`);

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

            // Remove from ignoreClasses if present
            if (cls && rulesConfig && typeof rulesConfig.ignoreClasses === "string") {
                const classes = rulesConfig.ignoreClasses.split(",").map(s => s.trim()).filter(Boolean);
                const filtered = classes.filter(c => c !== cls && c.toLowerCase() !== cls.toLowerCase());
                if (filtered.length !== classes.length) {
                    rulesConfig.ignoreClasses = filtered.join(",");
                    print(`[Direktor WindowRegistry] Removed '${cls}' from ignoreClasses.`);
                    try {
                        if (typeof callDBus === "function") {
                            callDBus("org.kde.kwriteconfig", "/kwriteconfig", "org.kde.kwriteconfig", "writeEntry", "kwinrc", "Script-org.kde.kwin.direktor", "ignoreClasses", rulesConfig.ignoreClasses);
                        }
                    } catch (e) {}
                }
            }

            // Tile the window immediately
            this.engine.tileWindow(window);
            return { oldState: oldState, newState: "tiled", caption, cls };
        }
    }
}

// --- Module: src/layouts/LayoutEngine.js ---
/**
 * ============================================================================
 * Direktor Base Layout Engine Interface
 * ============================================================================
 * All Direktor layout engines (Dwindle, Niri Scrollable, Master-Stack, Floating)
 * extend this abstract base class.
 */

class LayoutEngine {
    /**
     * @param {string} id Unique layout identifier (e.g., "dwindle", "niri-scrollable")
     * @param {string} name Human-readable layout display name
     */
    constructor(id, name) {
        this.id = id;
        this.name = name;
    }

    /**
     * Applies the layout algorithm to a given output monitor's root tile and window list.
     * @param {KWin.Tile} rootTile Root C++ Tile canvas for the output
     * @param {KWin.Window[]} windows Ordered list of normal windows on this screen
     * @param {KWin.Output} output Physical monitor output
     */
    applyLayout(rootTile, windows, output) {
        throw new Error(`[LayoutEngine] applyLayout() must be implemented by subclass ${this.name}`);
    }

    /**
     * Optional hook called when a window on this layout is interactively resized or moved by the user.
     * @param {KWin.Window} window The window that was moved or resized
     * @param {KWin.Output} output Physical monitor output
     * @param {KWin.Window[]} windows Current list of normal windows on this output/desktop
     */
    handleWindowInteractiveEvent(window, output, windows) {
        // Default no-op. Subclasses like Dwindle can update split ratios and swap tree nodes here.
    }
}

// --- Module: src/layouts/DwindleLayout.js ---
/**
 * ============================================================================
 * Direktor: Dwindle Layout Engine (Hyprland-style Persistent Binary Tree)
 * ============================================================================
 * Implements a persistent binary tree per virtual desktop and physical monitor.
 * Exactly models Hyprland's SDwindleNodeData and CDwindleAlgorithm:
 * - Persistent split container nodes tracking splitRatio (default 1.0) and direction (splitTop)
 * - Dynamic ratio adjustment when user drag-resizes window borders (persists across add/remove)
 * - Array-shift node replacement when user drag-moves a window onto another tiled window
 */


class DwindleNode {
    constructor(window = null) {
        this.isLeaf = (window !== null);
        this.window = window;
        this.parent = null;
        this.children = [null, null];
        this.splitTop = false; // false = horizontal split (left/right), true = vertical split (top/bottom)
        this.splitRatio = 1.0; // 1.0 = 50/50 split ratio
        this.box = { x: 0, y: 0, width: 0, height: 0 };
    }
}

class DwindleLayout extends LayoutEngine {
    constructor() {
        super("dwindle", "Dwindle (Hyprland)");
        // Key: `${outputName}_${desktopId}` -> DwindleNode root
        this.trees = new Map();
    }

    _getKey(output) {
        const outName = output ? output.name : "default";
        let desktopId = "default";
        try {
            if (typeof workspace !== "undefined" && workspace.currentDesktop) {
                const cd = workspace.currentDesktop;
                desktopId = cd.id || cd.name || cd;
            }
        } catch (e) {}
        return outName + "_" + desktopId;
    }

    _getAllLeaves(node, list = []) {
        if (!node) return list;
        if (node.isLeaf && node.window) {
            list.push(node);
        } else {
            this._getAllLeaves(node.children[0], list);
            this._getAllLeaves(node.children[1], list);
        }
        return list;
    }

    _findLeafByWindow(node, window) {
        if (!node || !window) return null;
        if (node.isLeaf && node.window === window) return node;
        if (!node.isLeaf) {
            return this._findLeafByWindow(node.children[0], window) || this._findLeafByWindow(node.children[1], window);
        }
        return null;
    }

    _findLeafAtPoint(node, x, y) {
        if (!node) return null;
        if (x < node.box.x || x > node.box.x + node.box.width || y < node.box.y || y > node.box.y + node.box.height) {
            return null;
        }
        if (node.isLeaf) return node;
        return this._findLeafAtPoint(node.children[0], x, y) || this._findLeafAtPoint(node.children[1], x, y);
    }

    _getLastLeaf(node) {
        if (!node) return null;
        if (node.isLeaf) return node;
        return this._getLastLeaf(node.children[1]) || this._getLastLeaf(node.children[0]);
    }

    _removeNode(root, leaf) {
        if (!leaf || !root) return root;
        if (leaf === root) return null;

        const parent = leaf.parent;
        if (!parent) return root;

        const sibling = (parent.children[0] === leaf) ? parent.children[1] : parent.children[0];
        const grand = parent.parent;

        if (grand) {
            if (grand.children[0] === parent) grand.children[0] = sibling;
            else grand.children[1] = sibling;
            if (sibling) sibling.parent = grand;
        } else {
            root = sibling;
            if (sibling) sibling.parent = null;
        }
        return root;
    }

    _insertWindow(root, newWin, area, targetWin) {
        if (!root) {
            const node = new DwindleNode(newWin);
            node.box = { x: area.x, y: area.y, width: area.width, height: area.height };
            return node;
        }

        let targetLeaf = null;
        if (targetWin && targetWin !== newWin) {
            targetLeaf = this._findLeafByWindow(root, targetWin);
        }
        if (!targetLeaf) {
            targetLeaf = this._getLastLeaf(root);
        }
        if (!targetLeaf) {
            const node = new DwindleNode(newWin);
            node.box = { x: area.x, y: area.y, width: area.width, height: area.height };
            return node;
        }

        const newParent = new DwindleNode(null);
        newParent.box = { x: targetLeaf.box.x, y: targetLeaf.box.y, width: targetLeaf.box.width, height: targetLeaf.box.height };
        newParent.parent = targetLeaf.parent;

        if (targetLeaf.parent) {
            if (targetLeaf.parent.children[0] === targetLeaf) targetLeaf.parent.children[0] = newParent;
            else targetLeaf.parent.children[1] = newParent;
        } else if (targetLeaf === root) {
            root = newParent;
        }

        const newNode = new DwindleNode(newWin);
        // Hyprland decision: if height > width, split vertically (top/bottom), else horizontally (left/right)
        newParent.splitTop = (newParent.box.height > newParent.box.width);

        newParent.children[0] = targetLeaf;
        newParent.children[1] = newNode;
        targetLeaf.parent = newParent;
        newNode.parent = newParent;

        return root;
    }

    _recalcSizePosRecursive(node, p) {
        if (!node) return;

        if (node.isLeaf && node.window) {
            TileUtils.assignWindowRect(node.window, {
                x: node.box.x + p,
                y: node.box.y + p,
                width: node.box.width - 2 * p,
                height: node.box.height - 2 * p
            });
            return;
        }

        if (!node.isLeaf && node.children[0] && node.children[1]) {
            if (!node.splitTop) {
                // Horizontal split (left / right)
                const firstW = Math.floor((node.box.width / 2.0) * node.splitRatio);
                node.children[0].box = { x: node.box.x, y: node.box.y, width: firstW, height: node.box.height };
                node.children[1].box = { x: node.box.x + firstW, y: node.box.y, width: node.box.width - firstW, height: node.box.height };
            } else {
                // Vertical split (top / bottom)
                const firstH = Math.floor((node.box.height / 2.0) * node.splitRatio);
                node.children[0].box = { x: node.box.x, y: node.box.y, width: node.box.width, height: firstH };
                node.children[1].box = { x: node.box.x, y: node.box.y + firstH, width: node.box.width, height: node.box.height - firstH };
            }

            this._recalcSizePosRecursive(node.children[0], p);
            this._recalcSizePosRecursive(node.children[1], p);
        }
    }

    applyLayout(rootTile, windows, output) {
        if (!windows || windows.length === 0 || !output) {
            const key = this._getKey(output);
            this.trees.delete(key);
            return;
        }

        const area = TileUtils.getUsableArea(output, windows[0]);
        const p = (rootTile && typeof rootTile.padding === "number") ? rootTile.padding : 8;
        const key = this._getKey(output);

        let root = this.trees.get(key) || null;

        // 1. Prune leaves whose windows are no longer in this workspace/output
        const currentLeaves = this._getAllLeaves(root);
        for (let i = 0; i < currentLeaves.length; i++) {
            const leaf = currentLeaves[i];
            if (!windows.includes(leaf.window)) {
                root = this._removeNode(root, leaf);
            }
        }

        // 2. Insert new windows that aren't in the tree yet
        const updatedLeaves = this._getAllLeaves(root);
        const activeWin = (typeof workspace !== "undefined" && workspace.activeWindow) ? workspace.activeWindow : null;

        for (let i = 0; i < windows.length; i++) {
            const win = windows[i];
            if (!updatedLeaves.some(l => l.window === win)) {
                root = this._insertWindow(root, win, area, activeWin);
            }
        }

        this.trees.set(key, root);

        if (root) {
            root.box = { x: area.x, y: area.y, width: area.width, height: area.height };
            this._recalcSizePosRecursive(root, p);
        }
    }

    handleWindowInteractiveEvent(window, output, windows) {
        if (!window || !output) return;
        const key = this._getKey(output);
        const root = this.trees.get(key);
        if (!root) return;

        const leaf = this._findLeafByWindow(root, window);
        if (!leaf) return;

        const geom = window.frameGeometry;
        if (!geom) return;

        const centerX = geom.x + geom.width / 2.0;
        const centerY = geom.y + geom.height / 2.0;

        // 1. Check if the user dragged/moved the window over another tiled window
        // Intended goal: array-like shift replacement. If we move 5th window to the place of 3rd,
        // previous 3rd moves to 4th, 4th to 5th.
        const targetLeaf = this._findLeafAtPoint(root, centerX, centerY);
        if (targetLeaf && targetLeaf !== leaf && targetLeaf.window && targetLeaf.window !== window) {
            const allLeaves = this._getAllLeaves(root);
            const fromIdx = allLeaves.indexOf(leaf);
            const toIdx = allLeaves.indexOf(targetLeaf);
            if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
                const order = allLeaves.map(l => l.window);
                const movedWin = order.splice(fromIdx, 1)[0];
                order.splice(toIdx, 0, movedWin);
                for (let i = 0; i < allLeaves.length; i++) {
                    allLeaves[i].window = order[i];
                }
                print(`[Direktor Dwindle] Replaced window order: moved ${window.caption} to index ${toIdx}`);
                return;
            }
        }

        // 2. Check if the user resized the window border (adjust splitRatio on the relevant parent container)
        const widthDiff = Math.abs(geom.width - leaf.box.width);
        const heightDiff = Math.abs(geom.height - leaf.box.height);

        if (widthDiff > 6 || heightDiff > 6) {
            if (widthDiff >= heightDiff) {
                // Horizontal width resize: walk up to find the first parent that splits left/right (!splitTop)
                let curr = leaf;
                while (curr.parent) {
                    if (!curr.parent.splitTop && curr.parent.children[0] && curr.parent.children[1]) {
                        const targetHalfW = curr.parent.box.width / 2.0;
                        if (targetHalfW > 10) {
                            if (curr === curr.parent.children[0]) {
                                curr.parent.splitRatio = Math.max(0.15, Math.min(1.85, geom.width / targetHalfW));
                            } else {
                                const leftW = curr.parent.box.width - geom.width;
                                curr.parent.splitRatio = Math.max(0.15, Math.min(1.85, leftW / targetHalfW));
                            }
                            print(`[Direktor Dwindle] Updated horizontal splitRatio to ${curr.parent.splitRatio}`);
                        }
                        break;
                    }
                    curr = curr.parent;
                }
            } else {
                // Vertical height resize: walk up to find the first parent that splits top/bottom (splitTop)
                let curr = leaf;
                while (curr.parent) {
                    if (curr.parent.splitTop && curr.parent.children[0] && curr.parent.children[1]) {
                        const targetHalfH = curr.parent.box.height / 2.0;
                        if (targetHalfH > 10) {
                            if (curr === curr.parent.children[0]) {
                                curr.parent.splitRatio = Math.max(0.15, Math.min(1.85, geom.height / targetHalfH));
                            } else {
                                const topH = curr.parent.box.height - geom.height;
                                curr.parent.splitRatio = Math.max(0.15, Math.min(1.85, topH / targetHalfH));
                            }
                            print(`[Direktor Dwindle] Updated vertical splitRatio to ${curr.parent.splitRatio}`);
                        }
                        break;
                    }
                    curr = curr.parent;
                }
            }
        }
    }
}

// --- Module: src/layouts/ScrollableNiriLayout.js ---
/**
 * ============================================================================
 * Direktor: Scrollable Column & Tabbed Layout Engine (Niri-style)
 * ============================================================================
 * Organizes windows into horizontal columns across the logical viewport strip.
 */


class ScrollableNiriLayout extends LayoutEngine {
    constructor(defaultColumnCapacity = 2, tabbedSubSplit = true) {
        super("niri-scrollable", "Scrollable Columns & Tabs (Niri)");
        this.columnCapacity = defaultColumnCapacity;
        this.tabbedSubSplit = tabbedSubSplit;
    }

    applyLayout(rootTile, windows, output) {
        if (!windows || windows.length === 0 || !output) return;

        const area = TileUtils.getUsableArea(output, windows[0]);
        const p = (rootTile && typeof rootTile.padding === "number") ? rootTile.padding : 8;

        const numCols = Math.ceil(windows.length / this.columnCapacity);
        const colWidth = Math.floor(area.width / numCols);

        let winIdx = 0;
        for (let c = 0; c < numCols && winIdx < windows.length; c++) {
            const countInCol = Math.min(this.columnCapacity, windows.length - winIdx);
            const colX = area.x + c * colWidth;
            const actualColW = (c === numCols - 1) ? (area.width - c * colWidth) : colWidth;
            const sliceH = Math.floor(area.height / countInCol);

            for (let r = 0; r < countInCol; r++) {
                const yOffset = r * sliceH;
                const h = (r === countInCol - 1) ? (area.height - yOffset) : sliceH;
                TileUtils.assignWindowRect(windows[winIdx++], {
                    x: colX + p,
                    y: area.y + yOffset + p,
                    width: actualColW - 2 * p,
                    height: h - 2 * p
                });
            }
        }
    }
}

// --- Module: src/layouts/FloatingLayout.js ---
/**
 * ============================================================================
 * Direktor: All-Floating Layout Engine
 * ============================================================================
 * Disables tiling for all windows on the current monitor/workspace by setting
 * `window.tile = null`. Allows full unconstrained window dragging and resizing.
 */


class FloatingLayout extends LayoutEngine {
    constructor() {
        super("floating", "All Floating");
    }

    /**
     * @param {KWin.Tile} rootTile
     * @param {KWin.Window[]} windows
     * @param {KWin.Output} output
     */
    applyLayout(rootTile, windows, output) {
        if (!windows) return;
        for (const window of windows) {
            TileUtils.untileWindow(window);
        }
    }
}

// --- Module: src/layouts/MasterStackLayout.js ---
/**
 * ============================================================================
 * Direktor: Master-Stack Layout Engine (DWM / Krohnkite style)
 * ============================================================================
 * Splits the screen into two main columns:
 * - Left column: Master area holding the primary window(s)
 * - Right column: Stack area holding remaining windows split vertically
 */


class MasterStackLayout extends LayoutEngine {
    constructor(masterCount = 1, masterRatio = 0.55) {
        super("master-stack", "Master & Stack");
        this.masterCount = masterCount;
        this.masterRatio = masterRatio;
    }

    applyLayout(rootTile, windows, output) {
        if (!windows || windows.length === 0 || !output) return;

        const area = TileUtils.getUsableArea(output, windows[0]);
        const p = (rootTile && typeof rootTile.padding === "number") ? rootTile.padding : 8;

        if (windows.length === 1) {
            TileUtils.assignWindowRect(windows[0], {
                x: area.x + p,
                y: area.y + p,
                width: area.width - 2 * p,
                height: area.height - 2 * p
            });
            return;
        }

        const masterW = Math.floor(area.width * this.masterRatio);
        const stackW = area.width - masterW;

        // Master window on the left
        TileUtils.assignWindowRect(windows[0], {
            x: area.x + p,
            y: area.y + p,
            width: masterW - 2 * p,
            height: area.height - 2 * p
        });

        // Stack windows on the right, stacked vertically
        const numStack = windows.length - 1;
        const sliceH = Math.floor(area.height / numStack);
        for (let i = 1; i < windows.length; i++) {
            const rowIdx = i - 1;
            const yOffset = rowIdx * sliceH;
            const h = (rowIdx === numStack - 1) ? (area.height - yOffset) : sliceH;
            TileUtils.assignWindowRect(windows[i], {
                x: area.x + masterW + p,
                y: area.y + yOffset + p,
                width: stackW - 2 * p,
                height: h - 2 * p
            });
        }
    }
}

// --- Module: src/layouts/LayoutManager.js ---
/**
 * ============================================================================
 * Direktor: Layout Manager
 * ============================================================================
 * Coordinates all available layout engines, tracks per-output active layout,
 * and handles layout cycling and application.
 */


class LayoutManager {
    constructor() {
        this.layouts = new Map();
        this.activeLayoutIdByOutput = new Map();

        // Register core built-in layouts
        this.registerLayout(new DwindleLayout());
        this.registerLayout(new ScrollableNiriLayout(2, true));
        this.registerLayout(new FloatingLayout());
        this.registerLayout(new MasterStackLayout(1, 0.55));

        this.layoutOrder = [
            "dwindle",
            "niri-scrollable",
            "master-stack",
            "floating"
        ];
    }

    registerLayout(layoutEngine) {
        this.layouts.set(layoutEngine.id, layoutEngine);
    }

    getLayout(layoutId) {
        return this.layouts.get(layoutId) || this.layouts.get("dwindle");
    }

    getActiveLayoutId(outputName) {
        return this.activeLayoutIdByOutput.get(outputName) || "dwindle";
    }

    getActiveLayout(outputOrName) {
        const outputName = typeof outputOrName === "object" && outputOrName ? (outputOrName.name || "default") : (outputOrName || "default");
        const layoutId = this.getActiveLayoutId(outputName);
        return this.getLayout(layoutId);
    }

    setActiveLayoutId(outputName, layoutId) {
        if (this.layouts.has(layoutId)) {
            this.activeLayoutIdByOutput.set(outputName, layoutId);
        }
    }

    cycleNextLayout(outputName) {
        const currentId = this.getActiveLayoutId(outputName);
        const currentIdx = this.layoutOrder.indexOf(currentId);
        const nextIdx = (currentIdx + 1) % this.layoutOrder.length;
        const nextId = this.layoutOrder[nextIdx];
        this.setActiveLayoutId(outputName, nextId);
        return this.getLayout(nextId);
    }

    /**
     * Recomputes and applies the active layout for a given screen output.
     * @param {KWin.TileManager} tileManager
     * @param {KWin.Window[]} windows
     */
    applyLayoutToScreen(tileManager, windows) {
        if (!tileManager || !tileManager.output || !tileManager.rootTile) return;
        const output = tileManager.output;
        const layoutId = this.getActiveLayoutId(output.name);
        const layoutEngine = this.getLayout(layoutId);

        // Reset root tile tree so layout engine can build cleanly
        TileUtils.resetRootTile(tileManager.rootTile);

        // Execute active layout engine
        layoutEngine.applyLayout(tileManager.rootTile, windows, output);
    }
}

// --- Module: src/config/ConfigManager.js ---
/**
 * ============================================================================
 * Direktor: JSON Configuration Manager
 * ============================================================================
 * Manages loading, validating, and applying `~/.config/direktor/config.json`.
 * Controls global padding, default layouts per monitor, and window rules.
 */

const DEFAULT_CONFIG = {
    version: "1.0",
    general: {
        defaultLayout: "dwindle",
        padding: 8,                // Gap between tiled windows in px
        revertTimeoutSeconds: 15   // Safety timeout when testing configurations
    },
    monitors: {
        // Output-specific overrides, e.g. "DP-1": { "layout": "niri-scrollable" }
    },
    rules: [
        {
            match: { resourceClass: "krunner" },
            action: "ignore"
        },
        {
            match: { resourceClass: "yakuake" },
            action: "ignore"
        },
        {
            match: { resourceClass: "org.kde.spectacle" },
            action: "float"
        },
        {
            match: { dialog: true },
            action: "float"
        }
    ],
    shortcuts: {
        "toggle_floating": "Meta+Shift+F",
        "cycle_layout": "Meta+Space",
        "promote_master": "Meta+Return"
    }
};

class ConfigManager {
    constructor() {
        this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.onConfigChangedCallbacks = [];
        this.reloadFromKWin();
    }

    /**
     * Loads JSON configuration from string or object.
     * In KWin Plasma 6 scripting, file I/O can be bridged via QML XMLHttpRequest
     * or KConfig backend.
     * @param {Object|string} rawConfig
     */
    loadConfig(rawConfig) {
        try {
            const parsed = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
            this.config = this.mergeConfig(DEFAULT_CONFIG, parsed);
            this.notifyConfigChanged();
            return true;
        } catch (err) {
            print(`[Direktor ConfigManager] Error loading JSON config: ${err}`);
            return false;
        }
    }

    mergeConfig(base, override) {
        const result = Object.assign({}, base);
        for (const key of Object.keys(override || {})) {
            if (override[key] && typeof override[key] === "object" && !Array.isArray(override[key])) {
                result[key] = this.mergeConfig(base[key] || {}, override[key]);
            } else {
                result[key] = override[key];
            }
        }
        return result;
    }

    getGeneralSettings() {
        return this.config.general || DEFAULT_CONFIG.general;
    }

    getRules() {
        return this.config.rules || [];
    }

    getLayoutForMonitor(outputName) {
        if (this.config.monitors && this.config.monitors[outputName]) {
            return this.config.monitors[outputName].layout || this.config.general.defaultLayout;
        }
        return this.config.general.defaultLayout;
    }

    reloadFromKWin(force = false) {
        if (typeof KWin === "undefined" || typeof KWin.readConfig !== "function") return { changed: false, rulesChanged: false };
        const now = Date.now();
        if (!force && this._lastReload && (now - this._lastReload < 500)) {
            return { changed: false, rulesChanged: false };
        }
        this._lastReload = now;
        try {
            this.config.general.defaultLayout = String(typeof options !== "undefined" && typeof options.defaultLayout !== "undefined" ? options.defaultLayout : KWin.readConfig("defaultLayout", "dwindle"));
            this.config.general.padding = parseInt(typeof options !== "undefined" && typeof options.padding !== "undefined" ? options.padding : KWin.readConfig("padding", 8), 10);
            this.config.general.animationDuration = parseInt(typeof options !== "undefined" && typeof options.animationDuration !== "undefined" ? options.animationDuration : KWin.readConfig("animationDuration", 300), 10);

            const defIgnoreClasses = "kscreenlocker,sddm,greeter,lockscreen,krunner,yakuake,spectacle,plasmashell,ksmserver,kded5,org.kde.kscreenlocker_greet,org.kde.plasmashell,kcalc,systemsettings,pavucontrol,org.kde.polkit-kde-authentication-agent-1,org.kde.kdialog";
            const defIgnoreTitles = "Desktop — Plasma,Desktop,Screen Locker,Login Screen,Greeter,Open File,Save File,Preferences,Settings,Authentication";

            const rawRegex = typeof options !== "undefined" && typeof options.useRegexOverrides !== "undefined" ? options.useRegexOverrides : KWin.readConfig("useRegexOverrides", true);
            const rawIgnoreClasses = typeof options !== "undefined" && typeof options.ignoreClasses !== "undefined" ? options.ignoreClasses : KWin.readConfig("ignoreClasses", defIgnoreClasses);
            const rawIgnoreTitles = typeof options !== "undefined" && typeof options.ignoreTitles !== "undefined" ? options.ignoreTitles : KWin.readConfig("ignoreTitles", defIgnoreTitles);

            const useRegex = rawRegex === true || rawRegex === "true" || rawRegex === 1 || rawRegex === "1";
            const newIgnoreClasses = String(rawIgnoreClasses);
            const newIgnoreTitles = String(rawIgnoreTitles);

            const oldIgnoreClasses = this.config.rulesConfig ? this.config.rulesConfig.ignoreClasses : "";
            const oldIgnoreTitles = this.config.rulesConfig ? this.config.rulesConfig.ignoreTitles : "";
            const rulesChanged = (oldIgnoreClasses !== newIgnoreClasses || oldIgnoreTitles !== newIgnoreTitles);

            this.config.rulesConfig = {
                useRegexOverrides: useRegex,
                ignoreClasses: newIgnoreClasses,
                ignoreTitles: newIgnoreTitles
            };

            const rawCustomShortcuts = typeof options !== "undefined" && typeof options.customShortcuts !== "undefined" ? options.customShortcuts : KWin.readConfig("customShortcuts", "");
            const parsedBindings = [];
            if (rawCustomShortcuts && typeof rawCustomShortcuts === "string") {
                const lines = rawCustomShortcuts.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith("#")) continue;
                    const parts = line.replace(/^bind\s*=\s*/i, "").split(",").map(s => s.trim()).filter(Boolean);
                    if (parts.length >= 2) {
                        const name = parts[0].replace(/^["']|["']$/g, "").trim();
                        let action = parts[1].replace(/^["']|["']$/g, "").trim();
                        const message = parts[2] ? parts[2].replace(/^["']|["']$/g, "").trim() : "";
                        if (action.toLowerCase() === "this.window.togglefloat") action = "toggle_floating";
                        if (action.toLowerCase() === "this.layout.cycle") action = "cycle_layout";
                        const id = "direktor_custom_" + name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                        parsedBindings.push({ id, name: "Direktor: " + name, action, message });
                    }
                }
            }
            this.config.customBindings = parsedBindings;

            return { changed: true, rulesChanged: rulesChanged };
        } catch (e) {
            print("[Direktor ConfigManager] Error reading KWin config: " + e);
        }
        return { changed: false, rulesChanged: false };
    }

    getRulesConfig() {
        this.reloadFromKWin(false);
        return this.config.rulesConfig || {
            useRegexOverrides: true,
            ignoreClasses: "kscreenlocker,sddm,greeter,lockscreen,krunner,yakuake,spectacle,plasmashell,ksmserver,kded5,org.kde.kscreenlocker_greet,org.kde.plasmashell,kcalc,systemsettings,pavucontrol,org.kde.polkit-kde-authentication-agent-1,org.kde.kdialog",
            ignoreTitles: "Desktop — Plasma,Desktop,Screen Locker,Login Screen,Greeter,Open File,Save File,Preferences,Settings,Authentication"
        };
    }

    onConfigChanged(callback) {
        this.onConfigChangedCallbacks.push(callback);
    }

    notifyConfigChanged() {
        for (const cb of this.onConfigChangedCallbacks) {
            try {
                cb(this.config);
            } catch (e) {
                print(`[Direktor ConfigManager] Callback error: ${e}`);
            }
        }
    }
}

// --- Module: src/config/WindowRuleEngine.js ---
/**
 * ============================================================================
 * Direktor: Window Rule Engine
 * ============================================================================
 * Evaluates application windows against the JSON rules matrix to decide
 * tiling vs. floating vs. ignoring.
 */

class WindowRuleEngine {
    /**
     * @param {ConfigManager} configManager
     */
    constructor(configManager) {
        this.configManager = configManager;
    }

    /**
     * Evaluates a KWin window and returns the action to take.
     * @param {KWin.Window} window
     * @returns {"tile" | "float" | "ignore"}
     */
    evaluateWindow(window) {
        if (!window) return "ignore";

        if (typeof this.configManager.reloadFromKWin === "function") {
            this.configManager.reloadFromKWin(false);
        }

        // Built-in safety checks: skip desktop, splash screens, lock screen, login greeters, popups
        if (window.splash || window.lockScreen || window.onScreenDisplay || window.popupWindow) {
            return "ignore";
        }

        const cls = [
            window.resourceClass || "",
            window.resourceName || "",
            window.desktopFileName || "",
            window.appId || ""
        ].filter(Boolean).join(" ");
        const role = String(window.windowRole || window.windowType || "");
        const caption = String(window.caption || "");
        const fullIdentity = `${cls} ${role} ${caption}`.trim();

        // Hardcoded safety ignores
        if (/kscreenlocker|sddm|greeter|lockscreen|krunner|yakuake|spectacle|ksmserver|org\.kde\.kscreenlocker.*|org\.kde\.plasmashell/i.test(fullIdentity)) {
            return "ignore";
        }

        // Configurable User Overrides from KWin UI (Binary Karousel-style Override: Ignore vs Tile)
        const rulesConfig = typeof this.configManager.getRulesConfig === "function" ? this.configManager.getRulesConfig() : null;
        if (rulesConfig) {
            const useRegex = !!rulesConfig.useRegexOverrides;
            if (this.matchesConfigList(fullIdentity, rulesConfig.ignoreClasses, useRegex) ||
                this.matchesConfigList(caption, rulesConfig.ignoreTitles, useRegex)) {
                console.log(`[Direktor RuleEngine] evaluateWindow: caption="${caption}", class="${window.resourceClass || ''}" -> IGNORE via rulesConfig.ignoreClasses/Titles`);
                return "ignore";
            }
        }

        const rules = this.configManager.getRules();
        for (const rule of rules) {
            if (this.matchesRule(window, rule.match)) {
                const action = rule.action || "tile";
                console.log(`[Direktor RuleEngine] evaluateWindow: caption="${caption}" -> ${action.toUpperCase()} via JSON rules`);
                return action;
            }
        }

        // By default, only true modal or transient child dialogs float; normal app windows tile
        if (window.modal || (window.dialog && window.transient)) {
            console.log(`[Direktor RuleEngine] evaluateWindow: caption="${caption}" -> FLOAT (modal/transient dialog)`);
            return "float";
        }

        console.log(`[Direktor RuleEngine] evaluateWindow: caption="${caption}", class="${window.resourceClass || ''}", fullIdentity="${fullIdentity}" -> TILE (default). ignoreClasses="${rulesConfig ? rulesConfig.ignoreClasses : 'null'}"`);
        return "tile";
    }

    matchesConfigList(value, configString, useRegex) {
        if (!value || !configString) return false;
        const strVal = String(value).trim();
        if (!strVal) return false;

        const items = String(configString).split(",").map(s => s.trim()).filter(Boolean);
        for (const item of items) {
            if (useRegex) {
                try {
                    const pattern = new RegExp(item, "i");
                    if (pattern.test(strVal)) return true;
                } catch (e) {
                    if (strVal.toLowerCase().includes(item.toLowerCase())) return true;
                }
            } else {
                if (strVal.toLowerCase() === item.toLowerCase() || strVal.toLowerCase().includes(item.toLowerCase())) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Checks whether a window matches a JSON rule filter object.
     * Supports exact string match or regex matching for resourceClass/caption.
     * @param {KWin.Window} window
     * @param {Object} matchFilter
     */
    matchesRule(window, matchFilter) {
        if (!matchFilter) return false;

        if (matchFilter.resourceClass) {
            const pattern = new RegExp(matchFilter.resourceClass, "i");
            if (!pattern.test(window.resourceClass || "")) {
                return false;
            }
        }

        if (matchFilter.caption) {
            const pattern = new RegExp(matchFilter.caption, "i");
            if (!pattern.test(window.caption || "")) {
                return false;
            }
        }

        if (typeof matchFilter.dialog === "boolean") {
            if (window.dialog !== matchFilter.dialog) {
                return false;
            }
        }

        return true;
    }
}

// --- Module: src/ipc/DBusBridge.js ---
/**
 * ============================================================================
 * Direktor: D-Bus & IPC Action Bridge
 * ============================================================================
 * Solves Plasma 6 KWin sandbox limitations by providing an action dispatcher
 * (`triggerAction`) that can be invoked via D-Bus (`org.kde.kwin.direktor`),
 * QML overlays, or `workspace.registerShortcut()`.
 */


class DBusBridge {
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
            if (res && typeof this.engine.showNotification === "function") {
                const stateStr = res.newState === "floating" ? "Floating" : "Tiled";
                this.engine.showNotification(`${stateStr}: ${res.caption || res.cls}`);
            }
        });

        // Cycle layout on current screen output
        this.registerAction("cycle_layout", () => {
            const activeWin = workspace.activeWindow;
            const output = activeWin ? activeWin.output : workspace.screens[0];
            if (!output) return;
            const newLayout = this.engine.layoutManager.cycleNextLayout(output.name);
            print(`[DBusBridge] Switched monitor ${output.name} layout to ${newLayout.name}`);
            if (typeof this.engine.showNotification === "function") {
                this.engine.showNotification(`Layout: ${newLayout.name}`);
            }
            this.engine.retileScreen(output);
        });

        // Explicitly set layout for current screen
        this.registerAction("set_layout", (layoutId) => {
            const activeWin = workspace.activeWindow;
            const output = activeWin ? activeWin.output : workspace.screens[0];
            if (!output || !layoutId) return;
            this.engine.layoutManager.setActiveLayoutId(output.name, layoutId);
            this.engine.retileScreen(output);
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

// --- Module: src/main.js ---
/**
 * ============================================================================
 * Direktor: Wayland-First Tiling Manager for KWin Plasma 6
 * ============================================================================
 * Main Entry Point (`main.js`)
 * Orchestrates Configuration, Window Rules, D-Bus IPC, and Layout Engines.
 */


class DirektorEngine {
    constructor() {
        print("[Direktor] Starting Wayland-First Tiling Manager for Plasma 6...");

        // 1. Initialize Subsystems
        this.configManager = new ConfigManager();
        this.ruleEngine = new WindowRuleEngine(this.configManager);
        this.registry = new WindowRegistry(this);
        this.layoutManager = new LayoutManager();
        this.dbusBridge = new DBusBridge(this);

        // Track tiled normal windows per monitor output name
        this.windowsByOutput = new Map();
        this.closingWindows = new Set();
        this.animationDuration = 300; // System animation duration wait (ms)

        // 2. Connect KWin Workspace Signals
        this.connectSignals();

        // 3. Register Global Keyboard Shortcuts
        this.registerShortcuts();

        // 4. Initial Screen Setup & discover existing open windows
        const existing = typeof workspace.windowList === "function" ? workspace.windowList() : (workspace.windowList || []);
        for (let i = 0; i < existing.length; i++) {
            this.handleWindowAdded(existing[i]);
        }
        this.retileAllScreens();

        print("[Direktor] Successfully initialized.");
    }

    kwinSetTimeout(func, delayMs) {
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

    connectSignals() {
        const self = this;
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
                    console.log("[Direktor] Options changed in System Settings. Reloading config with force=true...");
                    const res = this.configManager.reloadFromKWin(true);
                    if (res && res.changed) {
                        this.registerShortcuts();
                        this.animationDuration = this.configManager.getGeneralSettings().animationDuration || 300;
                        if (res.rulesChanged) {
                            console.log("[Direktor] Window rules/ignore lists changed. Performing targeted differential retiling...");
                            const allWin = typeof workspace.windowList === "function" ? workspace.windowList() : (workspace.windowList || []);
                            const affectedOutputs = new Set();
                            for (let i = 0; i < allWin.length; i++) {
                                const w = allWin[i];
                                if (!w || !w.normalWindow) continue;
                                const action = self.ruleEngine.evaluateWindow(w);
                                const currentState = self.registry.getState(w);
                                const isCurrentlyTiled = (currentState === "tiled");

                                if (action === "ignore" || action === "float") {
                                    if (isCurrentlyTiled) {
                                        console.log(`[Direktor] Differential update: untiling window '${w.caption || w.resourceClass}'`);
                                        self.registry.setState(w, action === "float" ? "floating" : "ignored");
                                        TileUtils.untileWindow(w);
                                        if (w.output) affectedOutputs.add(w.output);
                                    }
                                } else if (action === "tile") {
                                    if (!isCurrentlyTiled && !w.minimized && !self.closingWindows.has(w)) {
                                        console.log(`[Direktor] Differential update: tiling window '${w.caption || w.resourceClass}'`);
                                        self.registry.setState(w, "tiled");
                                        if (w.output) affectedOutputs.add(w.output);
                                    }
                                }
                            }
                            if (affectedOutputs.size > 0) {
                                affectedOutputs.forEach(output => self.retileScreen(output));
                            } else {
                                self.retileAllScreens();
                            }
                        } else {
                            this.retileAllScreens();
                        }
                    }
                });
            }
        } catch (e) {}
    }

    registerShortcuts() {
        const shortcuts = this.configManager.config.shortcuts || {};
        const self = this;

        registerShortcut(
            "direktor_toggle_floating",
            "Direktor: Toggle Active Window Floating State",
            shortcuts["toggle_floating"] || "Meta+Shift+F",
            function() { self.dbusBridge.triggerAction("toggle_floating"); }
        );

        registerShortcut(
            "direktor_cycle_layout",
            "Direktor: Cycle Layout on Current Monitor",
            shortcuts["cycle_layout"] || "Meta+Space",
            function() { self.dbusBridge.triggerAction("cycle_layout"); }
        );

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

    showNotification(text) {
        if (!text) return;
        print(`[Direktor OSD] ${text}`);
        try {
            if (typeof workspace.showOSD === "function") {
                workspace.showOSD(text, "preferences-system-windows");
                return;
            }
        } catch (e) {}
        try {
            if (!this._osdPopup) {
                const qmlStr = `
                import QtQuick 2.0
                Item {
                    id: popupRoot
                    property alias text: label.text
                    function show(msg, area, timeout) {
                        label.text = msg;
                        dialog.x = area.x + (area.width - dialog.width) / 2;
                        dialog.y = area.y + (area.height - dialog.height) / 2;
                        dialog.visible = true;
                        timer.restart();
                    }
                    Rectangle {
                        id: dialog
                        visible: false
                        width: Math.max(220, label.implicitWidth + 60)
                        height: 54
                        color: "#dd1c1f24"
                        radius: 8
                        border.color: "#3a3f4b"
                        border.width: 1
                        Text {
                            id: label
                            anchors.centerIn: parent
                            color: "#ffffff"
                            font.pointSize: 13
                            font.bold: true
                        }
                        Timer {
                            id: timer
                            interval: 1200
                            repeat: false
                            onTriggered: dialog.visible = false
                        }
                    }
                }`;
                this._osdPopup = Qt.createQmlObject(qmlStr, typeof scriptRoot !== "undefined" ? scriptRoot : null);
            }
            if (this._osdPopup && typeof this._osdPopup.show === "function") {
                const area = workspace.clientArea(0, workspace.activeScreen || workspace.screens[0], workspace.currentDesktop);
                this._osdPopup.show(text, area, 1200);
            }
        } catch (e) {
            print(`[Direktor OSD] Fallback error: ${e}`);
        }
    }

    connectWindowSignals(window) {
        if (!window || window._direktorConnected) return;
        window._direktorConnected = true;
        const self = this;

        const checkReEvaluate = () => {
            const entry = self.registry.getEntry(window);
            if (entry && entry.userOverridden) return;
            const newAction = self.ruleEngine.evaluateWindow(window);
            if (newAction === "ignore" || newAction === "float") {
                print(`[Direktor] Window properties updated (${newAction}): ${window.resourceClass || window.caption}`);
                self.registry.setState(window, newAction === "float" ? "floating" : "ignored");
                TileUtils.untileWindow(window);
                const output = window.output || workspace.activeScreen || workspace.screens[0];
                if (output) self.retileScreen(output);
            } else if (newAction === "tile" && self.registry.getState(window) !== "tiled") {
                self.registry.setState(window, "tiled");
                const output = window.output || workspace.activeScreen || workspace.screens[0];
                if (output) self.retileScreen(output);
            }
        };
        try { window.resourceClassChanged.connect(checkReEvaluate); } catch (e) {}
        try { window.captionChanged.connect(checkReEvaluate); } catch (e) {}

        const onFinished = () => {
            const output = window.output || workspace.activeScreen || workspace.screens[0];
            const allWin = typeof workspace.windowList === "function" ? workspace.windowList() : (workspace.windowList || []);
            const currentDesktop = workspace.currentDesktop;
            const windows = [];
            for (let i = 0; i < allWin.length; i++) {
                const w = allWin[i];
                if (w && w.normalWindow && !w.minimized && !self.closingWindows.has(w)) {
                    const entry = self.registry.getEntry(w);
                    const state = entry && entry.userOverridden ? entry.state : (self.ruleEngine.evaluateWindow(w) === "tile" ? "tiled" : "floating");
                    if (state === "tiled") {
                        const isOnScreen = workspace.screens.length <= 1 || w.output === output || (w.output && w.output.name === (output ? output.name : "default"));
                        const isOnDesktop = !currentDesktop || w.onAllDesktops || (w.desktops && w.desktops.includes(currentDesktop)) || (w.desktop === (currentDesktop.desktop || currentDesktop));
                        if (isOnScreen && isOnDesktop) windows.push(w);
                    }
                }
            }
            self.layoutManager.getActiveLayout(output).handleWindowInteractiveEvent(window, output, windows);
            self.retileScreen(output);
        };

        try { window.interactiveMoveResizeFinished.connect(onFinished); } catch (e) {}
        try {
            window.moveResizedChanged.connect(() => {
                if (window.resize || window.move || window.isInteractiveMoveResize) {
                    window._direktorResizing = true;
                } else {
                    window._direktorResizing = false;
                    onFinished();
                }
            });
        } catch (e) {}
        try {
            window.frameGeometryChanged.connect(() => {
                const output = window.output || workspace.activeScreen || workspace.screens[0];
                const allWin = typeof workspace.windowList === "function" ? workspace.windowList() : (workspace.windowList || []);
                const currentDesktop = workspace.currentDesktop;
                const windows = [];
                for (let i = 0; i < allWin.length; i++) {
                    const w = allWin[i];
                    if (w && w.normalWindow && !w.minimized && !self.closingWindows.has(w)) {
                        const entry = self.registry.getEntry(w);
                        const state = entry && entry.userOverridden ? entry.state : (self.ruleEngine.evaluateWindow(w) === "tile" ? "tiled" : "floating");
                        if (state === "tiled") {
                            const isOnScreen = workspace.screens.length <= 1 || w.output === output || (w.output && w.output.name === (output ? output.name : "default"));
                            const isOnDesktop = !currentDesktop || w.onAllDesktops || (w.desktops && w.desktops.includes(currentDesktop)) || (w.desktop === (currentDesktop.desktop || currentDesktop));
                            if (isOnScreen && isOnDesktop) windows.push(w);
                        }
                    }
                }
                if (window._direktorResizing || window.isInteractiveMoveResize || window.interactiveMoveResizeStep) {
                    self.layoutManager.getActiveLayout(output).handleWindowInteractiveEvent(window, output, windows);
                }
            });
        } catch (e) {}
    }

    handleWindowAdded(window) {
        const action = this.ruleEngine.evaluateWindow(window);
        if (action === "ignore") {
            this.registry.register(window, "ignored");
            return;
        }

        if (action === "float") {
            print(`[Direktor] Floating window matching rule: ${window.caption}`);
            this.registry.register(window, "floating");
            TileUtils.untileWindow(window);
            return;
        }

        // Action is "tile"
        this.registry.register(window, "tiled");
        this.tileWindow(window);
    }

    handleWindowRemoved(window) {
        if (!window) return;
        this.closingWindows.add(window);
        this.registry.unregister(window);
        const output = (window && window.output) ? window.output : (workspace.activeScreen || workspace.screens[0]);
        if (output) {
            const self = this;
            const delay = typeof this.animationDuration === "number" ? this.animationDuration : 300;
            this.kwinSetTimeout(() => {
                self.closingWindows.delete(window);
                self.retileScreen(output);
            }, delay);
        }
    }

    tileWindow(window) {
        if (!window) return;
        this.registry.setState(window, "tiled");
        this.connectWindowSignals(window);
        const output = window.output || workspace.activeScreen || workspace.screens[0];
        if (output) {
            this.retileScreen(output);
        }
    }

    retileScreen(output, ignoreWin = null) {
        if (!output && workspace.screens && workspace.screens.length > 0) {
            output = workspace.activeScreen || workspace.screens[0];
        }
        if (!output) return;

        const outputName = output.name;
        const allWin = typeof workspace.windowList === "function" ? workspace.windowList() : (workspace.windowList || []);
        const currentDesktop = workspace.currentDesktop;
        const windows = [];
        for (let i = 0; i < allWin.length; i++) {
            const w = allWin[i];
            if (!w || w === ignoreWin || !w.normalWindow || w.minimized || this.closingWindows.has(w)) {
                continue;
            }
            const isOnScreen = workspace.screens.length <= 1 || w.output === output || (w.output && w.output.name === outputName);
            const isOnDesktop = !currentDesktop || w.onAllDesktops || (w.desktops && w.desktops.includes(currentDesktop)) || (w.desktop === (currentDesktop.desktop || currentDesktop));
            if (!isOnScreen || !isOnDesktop) {
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

        print("[Direktor] retileScreen(" + outputName + "): applying layout to " + windows.length + " windows");

        // Grab C++ rootTile for padding configuration if available
        let rootTile = null;
        try {
            if (typeof workspace.rootTile === "function") {
                rootTile = workspace.rootTile(output, workspace.currentDesktop);
            }
        } catch (e) {
            rootTile = null;
        }
        if (!rootTile && typeof workspace.tilingForScreen === "function") {
            const tm = workspace.tilingForScreen(output);
            if (tm) rootTile = tm.rootTile;
        }

        const padding = this.configManager.getGeneralSettings().padding || 8;
        if (rootTile) {
            try { rootTile.padding = padding; } catch (e) {}
        }
        const tileObj = rootTile || { padding: padding };

        // Delegate to active layout engine
        this.layoutManager.applyLayoutToScreen({ rootTile: tileObj, output: output }, windows);
    }

    retileAllScreens() {
        for (const screen of workspace.screens) {
            this.retileScreen(screen);
        }
    }

    reloadConfiguration() {
        this.configManager.loadConfig(this.configManager.config);
        this.retileAllScreens();
    }
}

// Instantiate and start Direktor engine
const Direktor = new DirektorEngine();
