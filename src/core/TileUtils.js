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

export const DIRECTION_HORIZONTAL = 0; // Left | Right side-by-side split
export const DIRECTION_VERTICAL = 1;   // Top / Bottom stack split

export const TileUtils = {};

TileUtils.getWorkspaceWindows = function() {

        if (typeof workspace === "undefined" || !workspace) return [];
        const candidates = [
            { name: "windowList()", list: (typeof workspace.windowList === "function" ? (function() { try { return workspace.windowList(); } catch (e) { return null; } })() : null) },
            { name: "windowList", list: (typeof workspace.windowList !== "undefined" && typeof workspace.windowList !== "function" ? workspace.windowList : null) },
            { name: "stackingOrder", list: (typeof workspace.stackingOrder !== "undefined" ? workspace.stackingOrder : null) },
            { name: "windows", list: (typeof workspace.windows !== "undefined" ? workspace.windows : null) }
        ];
        let bestArr = [];
        let bestName = "none";
        const diag = [];
        for (let idx = 0; idx < candidates.length; idx++) {
            const item = candidates[idx];
            if (!item.list) {
                diag.push(item.name + "=null");
                continue;
            }
            let arr = [];
            if (Array.isArray(item.list)) {
                arr = item.list;
            } else if (typeof item.list.length === "number") {
                arr = Array.from(item.list);
            } else if (typeof item.list.count === "number") {
                for (let i = 0; i < item.list.count; i++) {
                    if (typeof item.list[i] !== "undefined") arr.push(item.list[i]);
                    else if (typeof item.list.at === "function") arr.push(item.list.at(i));
                }
            } else {
                try { arr = Array.from(item.list); } catch (e) {}
            }
            diag.push(item.name + "=" + arr.length);
            if (arr.length > bestArr.length) {
                bestArr = arr;
                bestName = item.name;
            }
        }
        return bestArr;
    }

TileUtils.isWindowOnDesktop = function(w, currentDesktop) {
        if (!w) return false;
        if (!currentDesktop || w.onAllDesktops) return true;
        const cdId = currentDesktop.id || currentDesktop.name || (typeof currentDesktop.desktop !== "undefined" ? currentDesktop.desktop : currentDesktop);
        if (w.desktops && typeof w.desktops.length !== "undefined") {
            for (let i = 0; i < w.desktops.length; i++) {
                const d = w.desktops[i];
                if (!d) continue;
                if (d === currentDesktop) return true;
                const dId = d.id || d.name || (typeof d.desktop !== "undefined" ? d.desktop : d);
                if (dId === cdId) return true;
            }
        }
        if (typeof w.desktop !== "undefined" && (w.desktop === cdId || w.desktop === currentDesktop)) {
            return true;
        }
        return false;
    }

TileUtils.isWindowOnScreen = function(w, output) {
        if (!w) return false;
        if (typeof workspace !== "undefined" && workspace.screens && workspace.screens.length <= 1) return true;
        if (!output) return true;
        if (w.output === output) return true;
        
        let outName = "default";
        if (output.name) outName = output.name;
        else if (typeof output === "string") outName = output;
        
        let winOutName = "default";
        if (w.output) {
            if (w.output.name) winOutName = w.output.name;
            else if (typeof w.output === "string") winOutName = w.output;
        }
        
        return winOutName === outName;
    }

TileUtils.computeSurfaceId = function(output, currentDesktop) {
        let outName = "default";
        if (output) {
            if (output.name) outName = output.name;
            else if (typeof output === "string") outName = output;
        }

        if (!TileUtils.perDesktopIsolation) {
            return outName + "_all";
        }

        let cdId = "all";
        if (currentDesktop) {
            if (currentDesktop.id) cdId = currentDesktop.id;
            else if (currentDesktop.name) cdId = currentDesktop.name;
            else if (typeof currentDesktop.desktop !== "undefined") cdId = currentDesktop.desktop;
            else cdId = currentDesktop;
        }

        return outName + "_" + cdId;
    }

    /**
     * Splits a tile into two child tiles along the given direction.
     * @param {KWin.Tile} tile Target tile to split
     * @param {number} direction DIRECTION_HORIZONTAL (0) or DIRECTION_VERTICAL (1)
     */
TileUtils.splitTile = function(tile, direction) {
        if (!tile) return;
        tile.split(direction);
    }

    /**
     * Collects all leaf tiles (tiles with no children) under a root or parent tile.
     * @param {KWin.Tile} tile Root or parent tile
     * @returns {KWin.Tile[]} Array of leaf tiles
     */
TileUtils.getLeafTiles = function(tile) {
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
TileUtils.resetRootTile = function(rootTile) {
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
TileUtils.assignWindowToTile = function(window, tile) {
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
TileUtils.untileWindow = function(window) {
        if (!window) return;
        if (window.tile !== null) {
            window.tile = null;
        }
        if (typeof window.quickTileMode !== "undefined") {
            window.quickTileMode = 0; // QuickTileFlag.None
        }
    }

    /**
     * Centers and resizes a floating window to an optimal size (or app preferred dimensions)
     * right in the middle of the screen without taking up the entire screen or being too small.
     * @param {KWin.Window} window
     * @param {Object} [savedGeometry]
     */
TileUtils.centerAndOptimizeFloatingWindow = function(window, savedGeometry, staggerOffset = 0) {
        if (!window || !window.normalWindow) return;
        const output = window.output || workspace.activeScreen || workspace.screens[0];
        const area = TileUtils.getUsableArea(output, window);
        if (!area) return;

        let targetW = 0;
        let targetH = 0;

        const checkGeo = savedGeometry || window.frameGeometry;
        const isTiledOrHuge = checkGeo && (checkGeo.width >= area.width - 80 || checkGeo.height >= area.height - 80 || checkGeo.height >= area.height * 0.82 || window.fullScreen || window.maximizeMode !== 0);
        const isTooSmall = !checkGeo || checkGeo.width < 300 || checkGeo.height < 200;

        if (checkGeo && savedGeometry && !isTiledOrHuge && !isTooSmall) {
            targetW = checkGeo.width;
            targetH = checkGeo.height;
        } else {
            targetW = Math.floor(area.width * 0.62);
            targetH = Math.floor(area.height * 0.65);
        }

        if (window.minSize) {
            if (typeof window.minSize.width === "number" && window.minSize.width > 0) targetW = Math.max(targetW, window.minSize.width);
            if (typeof window.minSize.height === "number" && window.minSize.height > 0) targetH = Math.max(targetH, window.minSize.height);
        }
        if (window.maxSize) {
            if (typeof window.maxSize.width === "number" && window.maxSize.width > 0 && window.maxSize.width >= targetW) targetW = Math.min(targetW, window.maxSize.width);
            if (typeof window.maxSize.height === "number" && window.maxSize.height > 0 && window.maxSize.height >= targetH) targetH = Math.min(targetH, window.maxSize.height);
        }

        targetW = Math.min(targetW, Math.max(300, area.width - 80));
        targetH = Math.min(targetH, Math.max(200, area.height - 80));

        const px = area.x + Math.floor((area.width - targetW) / 2) + staggerOffset;
        const py = area.y + Math.floor((area.height - targetH) / 2) + staggerOffset;

        const fg = window.frameGeometry;
        const needsUpdate = !fg || Math.abs(fg.x - px) > 3 || Math.abs(fg.y - py) > 3 || Math.abs(fg.width - targetW) > 4 || Math.abs(fg.height - targetH) > 4;
        if (needsUpdate) {
            TileUtils.untileWindow(window);
            window.frameGeometry = {
                x: px,
                y: py,
                width: targetW,
                height: targetH
            };
        }
    }

TileUtils.getUsableArea = function(output, sampleWin) {
        // Option 0 is KWin::PlacementArea (and Option 2 is KWin::MaximizeArea).
        // Both exclude static struts (static panels) while NOT excluding auto-hide panels.
        const opt = (typeof KWin !== "undefined" && typeof KWin.PlacementArea !== "undefined") ? KWin.PlacementArea : 0;
        if (output) {
            try {
                const area = workspace.clientArea(opt, output, workspace.currentDesktop);
                if (area && area.width > 100 && area.height > 100) return area;
            } catch (e) {}
        }
        if (sampleWin) {
            try {
                const area = workspace.clientArea(opt, sampleWin);
                if (area && area.width > 100 && area.height > 100) return area;
            } catch (e) {}
        }
        return (output && output.geometry) ? output.geometry : { x: 0, y: 0, width: 1920, height: 1080 };
    }

TileUtils.assignWindowRect = function(window, rect) {

        if (!window || !window.normalWindow || !rect) return;

        const toQRect = (x, y, width, height) => {
            try {
                if (typeof workspace !== "undefined" && typeof workspace._direktorMakeQRect === "function") {
                    return workspace._direktorMakeQRect(x, y, width, height);
                }
                if (typeof Workspace !== "undefined" && typeof Workspace._direktorMakeQRect === "function") {
                    return Workspace._direktorMakeQRect(x, y, width, height);
                }
                if (typeof Qt !== "undefined" && typeof Qt.rect === "function") {
                    return Qt.rect(x, y, width, height);
                }
            } catch (e) {}
            return { x: x, y: y, width: width, height: height };
        };

        if (window._direktorPseudo) {
            const fg = window.frameGeometry || { width: 600, height: 400 };
            const pw = Math.min(Math.max(100, fg.width), Math.max(100, rect.width));
            const ph = Math.min(Math.max(100, fg.height), Math.max(100, rect.height));
            const px = rect.x + Math.floor((rect.width - pw) / 2);
            const py = rect.y + Math.floor((rect.height - ph) / 2);
            const targetGeo = toQRect(px, py, pw, ph);
            const lastTarget = window._direktorLastTargetRect;
            const targetChanged = !lastTarget || lastTarget.x !== targetGeo.x || lastTarget.y !== targetGeo.y || lastTarget.width !== targetGeo.width || lastTarget.height !== targetGeo.height;
            window._direktorLastTargetRect = { x: targetGeo.x, y: targetGeo.y, width: targetGeo.width, height: targetGeo.height };

            const waylandMatches = Math.abs(fg.x - targetGeo.x) <= 15 && Math.abs(fg.y - targetGeo.y) <= 15 && Math.abs(fg.width - targetGeo.width) <= 35 && Math.abs(fg.height - targetGeo.height) <= 35;
            const needsUpdate = targetChanged || !waylandMatches;

            if (needsUpdate) {
                TileUtils.untileWindow(window);
                window.frameGeometry = targetGeo;
            }
            window._direktorCellRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            return;
        }

        let w = Math.max(20, rect.width);
        let h = Math.max(20, rect.height);

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

        let isOversized = false;
        window._direktorCellRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        if (window.minSize) {
            if (typeof window.minSize.width === "number" && window.minSize.width > rect.width) isOversized = true;
            if (typeof window.minSize.height === "number" && window.minSize.height > rect.height) isOversized = true;
        }

        if (!isOversized) {
            w = Math.min(w, Math.max(20, rect.width));
            h = Math.min(h, Math.max(20, rect.height));
        }

        let targetX = rect.x;
        let targetY = rect.y;

        // If the window is forced to be larger than its cell due to minSize, pseudo-tile it (center it over the cell)
        if (w > rect.width) {
            targetX = rect.x - (w - rect.width) / 2;
        }
        if (h > rect.height) {
            targetY = rect.y - (h - rect.height) / 2;
        }

        // Screen Edge Clamping (Hyprland Style)
        // Ensure the window does not bleed off the active screen (unless explicitly allowed by the layout engine, like Niri)
        const output = window.output || workspace.activeScreen || workspace.screens[0];
        if (output && output.geometry) {
            const screenX = output.geometry.x;
            const screenY = output.geometry.y;
            const screenW = output.geometry.width;
            const screenH = output.geometry.height;

            if (!rect.allowOffscreenX) {
                targetX = Math.max(screenX, Math.min(targetX, screenX + screenW - w));
            }
            if (!rect.allowOffscreenY) {
                targetY = Math.max(screenY, Math.min(targetY, screenY + screenH - h));
            }
        }

        const targetGeo = toQRect(targetX, targetY, w, h);
        const lastTarget = window._direktorLastTargetRect;
        const targetChanged = !lastTarget || lastTarget.x !== targetGeo.x || lastTarget.y !== targetGeo.y || lastTarget.width !== targetGeo.width || lastTarget.height !== targetGeo.height;
        window._direktorLastTargetRect = { x: targetGeo.x, y: targetGeo.y, width: targetGeo.width, height: targetGeo.height };

        const fg = window.frameGeometry;
        // Only ignore the update if the target hasn't changed AND Wayland has already closely matched our geometry
        // We use generous tolerances (15px for position, 35px for size) to accommodate terminal emulators (like Ghostty) that enforce strict character-cell step resizing.
        const waylandMatches = fg && Math.abs(fg.x - targetGeo.x) <= 15 && Math.abs(fg.y - targetGeo.y) <= 15 && Math.abs(fg.width - targetGeo.width) <= 35 && Math.abs(fg.height - targetGeo.height) <= 35;
        const needsUpdate = targetChanged || !waylandMatches;

        if (needsUpdate) {
            TileUtils.untileWindow(window);
            try {
                window.frameGeometry = targetGeo;

            } catch (e) {
                print("[Direktor TileUtils] ERROR setting frameGeometry: " + e);
            }
        }
    }

TileUtils.getLongestEdgeDirection = function(tile) {
        if (!tile || !tile.relativeGeometry) return DIRECTION_HORIZONTAL;
        const geom = tile.relativeGeometry;
        return geom.width >= geom.height ? DIRECTION_HORIZONTAL : DIRECTION_VERTICAL;
    }

    /**
     * Universal drag-and-drop array swapper for layouts based on Registry layoutPositions.
     * Checks if the dropped window's center coordinates fall within the bounds of another window.
     * If so, swaps their layoutPosition in the registry.
     * @returns {boolean} true if a swap occurred
     */
TileUtils.swapWindowsIfDropped = function(draggedWindow, windows, registry) {
        if (!draggedWindow || !windows || !registry) return false;
        
        try {
            const geom = draggedWindow.frameGeometry;
            if (!geom) return false;

            const centerX = geom.x + geom.width / 2.0;
            const centerY = geom.y + geom.height / 2.0;

            for (let i = 0; i < windows.length; i++) {
                const target = windows[i];
                if (target === draggedWindow || !target.frameGeometry) continue;
                
                const tx = target.frameGeometry.x;
                const ty = target.frameGeometry.y;
                const tw = target.frameGeometry.width;
                const th = target.frameGeometry.height;
                
                // Check if dropped center falls within the target's bounding box
                if (centerX >= tx && centerX <= tx + tw && centerY >= ty && centerY <= ty + th) {
                    const entryA = registry.getEntry(draggedWindow);
                    const entryB = registry.getEntry(target);
                    if (entryA && entryB && typeof entryA.layoutPosition === "number" && typeof entryB.layoutPosition === "number") {
                        const temp = entryA.layoutPosition;
                        entryA.layoutPosition = entryB.layoutPosition;
                        entryB.layoutPosition = temp;
                        print(`[Direktor] Universal swap: swapped positions of '${draggedWindow.caption}' and '${target.caption}'`);
                        return true;
                    }
                    break;
                }
            }
        } catch (e) {
            print(`[Direktor] Error in swapWindowsIfDropped: ${e}`);
        }
        return false;
    }

TileUtils.perDesktopIsolation = true;
