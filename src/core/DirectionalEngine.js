/**
 * ============================================================================
 * Direktor Core: Directional Focus and Move Engine (Hyprland / Krohnkite inspired)
 * ============================================================================
 * Implements precise spatial geometry calculations for directional focus and
 * directional window moving (swapping inside the layout tile tree).
 *
 * Strict spatial constraints enforced:
 * 1. Focus / move is strictly restricted to the CURRENT screen (output) and
 *    CURRENT virtual desktop. When reaching the edge of the monitor or desktop,
 *    switching stops completely without jumping across monitors or desktops.
 * 2. Spatial tie-breaking behavior (when multiple adjacent candidates align):
 *    - Left / Right: prioritize the above (topmost) window (geometry.y ascending).
 *    - Up / Down: prioritize the left (leftmost) window (geometry.x ascending).
 */

export function DirectionalEngine(direktorEngine) {
    this.engine = direktorEngine;
}


    /**
     * Checks if two ranges [aMin, aMax] and [bMin, bMax] overlap.
     */
DirectionalEngine.overlap = function(aMin, aMax, bMin, bMax) {
        return Math.max(aMin, bMin) < Math.min(aMax, bMax);
    }

    /**
     * Retrieves all visible normal windows on the exact same screen output
     * and virtual desktop as the reference window (`basis`).
     * @param {KWin.Window} basis
     * @returns {KWin.Window[]}
     */
DirectionalEngine.prototype.getWindowsInContext = function(basis) {
        if (!basis || !basis.normalWindow) return [];
        const allWin = TileUtils.getWorkspaceWindows();
        const basisOutput = basis.output || workspace.activeScreen || workspace.screens[0];
        const basisOutputName = basisOutput ? basisOutput.name : "";
        const currentDesktop = workspace.currentDesktop;

        const results = [];
        for (let i = 0; i < allWin.length; i++) {
            const w = allWin[i];
            if (!w || !w.normalWindow || w.specialWindow || w.minimized || w.lockScreen || w.splash || w === basis) {
                continue;
            }
            if (this.engine.closingWindows && this.engine.closingWindows.has(w)) {
                continue;
            }

            // Strictly check output
            if (!TileUtils.isWindowOnScreen(w, basisOutput)) continue;

            // Strictly check virtual desktop
            if (!TileUtils.isWindowOnDesktop(w, currentDesktop)) continue;

            results.push(w);
        }
        return results;
    }

    /**
     * Finds the nearest spatial neighbor in a given direction ("left", "right", "up", "down").
     * @param {KWin.Window} basis
     * @param {string} dir
     * @returns {KWin.Window|null}
     */
DirectionalEngine.prototype.getNeighborByDirection = function(basis, dir) {
        if (!basis || !basis.frameGeometry) return null;
        const candidates = this.getWindowsInContext(basis);
        if (candidates.length === 0) return null;

        const bg = basis._direktorCellRect || basis.frameGeometry;
        const bgMaxX = bg.x + bg.width;
        const bgMaxY = bg.y + bg.height;

        let vertical = false;
        let sign = 1;
        switch (dir.toLowerCase()) {
            case "up":
                vertical = true;
                sign = -1;
                break;
            case "down":
                vertical = true;
                sign = 1;
                break;
            case "left":
                vertical = false;
                sign = -1;
                break;
            case "right":
                vertical = false;
                sign = 1;
                break;
            default:
                return null;
        }

        // Stage 1: Strictly directional candidates that overlap along the orthogonal axis
        const overlapping = candidates.filter(w => {
            if (!w.frameGeometry) return false;
            const fg = w._direktorCellRect || w.frameGeometry;
            const fgMaxX = fg.x + fg.width;
            const fgMaxY = fg.y + fg.height;

            if (vertical) {
                // Must be above/below basis
                const isDir = sign < 0 ? fgMaxY <= bg.y + 8 : fg.y >= bgMaxY - 8;
                if (!isDir) return false;
                return DirectionalEngine.overlap(bg.x, bgMaxX, fg.x, fgMaxX);
            } else {
                // Must be left/right of basis
                const isDir = sign < 0 ? fgMaxX <= bg.x + 8 : fg.x >= bgMaxX - 8;
                if (!isDir) return false;
                return DirectionalEngine.overlap(bg.y, bgMaxY, fg.y, fgMaxY);
            }
        });

        let pool = overlapping;

        // Stage 2: If no strict orthogonal overlap exists, fallback to any window strictly in that direction on this screen/desktop
        if (pool.length === 0) {
            pool = candidates.filter(w => {
                if (!w.frameGeometry) return false;
                const fg = w._direktorCellRect || w.frameGeometry;
                const fgMaxX = fg.x + fg.width;
                const fgMaxY = fg.y + fg.height;

                if (vertical) {
                    return sign < 0 ? fgMaxY <= bg.y + 8 : fg.y >= bgMaxY - 8;
                } else {
                    return sign < 0 ? fgMaxX <= bg.x + 8 : fg.x >= bgMaxX - 8;
                }
            });
        }

        if (pool.length === 0) {
            // No candidates on this screen/desktop in this direction -> stop switching focus!
            return null;
        }

        // Find the closest distance along the primary axis
        let minEdgeDist = Infinity;
        for (const w of pool) {
            const fg = w._direktorCellRect || w.frameGeometry;
            const fgMaxX = fg.x + fg.width;
            const fgMaxY = fg.y + fg.height;

            let dist = Infinity;
            if (vertical) {
                dist = sign < 0 ? Math.abs(bg.y - fgMaxY) : Math.abs(fg.y - bgMaxY);
            } else {
                dist = sign < 0 ? Math.abs(bg.x - fgMaxX) : Math.abs(fg.x - bgMaxX);
            }
            if (dist < minEdgeDist) {
                minEdgeDist = dist;
            }
        }

        // Filter to all candidates within a narrow tolerance (e.g. 24px) of the closest column/row
        const closestCandidates = pool.filter(w => {
            const fg = w._direktorCellRect || w.frameGeometry;
            const fgMaxX = fg.x + fg.width;
            const fgMaxY = fg.y + fg.height;

            let dist = Infinity;
            if (vertical) {
                dist = sign < 0 ? Math.abs(bg.y - fgMaxY) : Math.abs(fg.y - bgMaxY);
            } else {
                dist = sign < 0 ? Math.abs(bg.x - fgMaxX) : Math.abs(fg.x - bgMaxX);
            }
            return Math.abs(dist - minEdgeDist) <= 24;
        });

        // Apply strict spatial tie-breaking priorities:
        // Left / Right: prioritize above (topmost) window -> sort by geometry.y ascending
        // Up / Down: prioritize left (leftmost) window -> sort by geometry.x ascending
        closestCandidates.sort((a, b) => {
            if (vertical) {
                return ((a._direktorCellRect || a.frameGeometry).x || 0) - ((b._direktorCellRect || b.frameGeometry).x || 0);
            } else {
                return ((a._direktorCellRect || a.frameGeometry).y || 0) - ((b._direktorCellRect || b.frameGeometry).y || 0);
            }
        });

        return closestCandidates[0] || null;
    }

    /**
     * Focuses the adjacent window in the specified direction.
     * Restricts focus strictly to the current output and virtual desktop.
     * @param {string} dir "left", "right", "up", "down"
     */
DirectionalEngine.prototype.focusDirection = function(dir) {
        const basis = workspace.activeWindow;
        if (!basis || !basis.normalWindow) return;

        const neighbor = this.getNeighborByDirection(basis, dir);
        if (neighbor) {
            print(`[DirectionalEngine] Focus ${dir.toUpperCase()}: switching from '${basis.caption}' to '${neighbor.caption}'`);
            workspace.activeWindow = neighbor;
        } else {
            print(`[DirectionalEngine] Focus ${dir.toUpperCase()}: no candidate on current screen/desktop.`);
        }
    }

    /**
     * Moves (swaps) the focused window in the specified direction.
     * For floating windows, nudges spatial geometry by 60px.
     * For tiled windows, swaps positions with the adjacent neighbor and retiles instantly.
     * @param {string} dir "left", "right", "up", "down"
     */
DirectionalEngine.prototype.moveDirection = function(dir) {
        const basis = workspace.activeWindow;
        if (!basis || !basis.normalWindow) return;

        const entry = this.engine.registry ? this.engine.registry.getEntry(basis) : null;
        let isFloating = entry ? (entry.state === "floating") : (basis.tile === null);
        if (!isFloating && this.engine && this.engine.layoutManager && typeof TileUtils !== "undefined") {
            const surfaceId = TileUtils.computeSurfaceId(basis.output, workspace.currentDesktop);
            if (this.engine.layoutManager.getActiveLayoutId(surfaceId) === "floating") {
                isFloating = true;
            }
        }

        if (isFloating) {
            // Nudge floating geometry
            const gen = (this.engine && this.engine.configManager && typeof this.engine.configManager.getGeneralSettings === "function") ? this.engine.configManager.getGeneralSettings() : {};
            const step = (typeof gen.moveStep === "number") ? gen.moveStep : 60;
            const fg = basis.frameGeometry;
            if (!fg) return;
            let nx = fg.x;
            let ny = fg.y;
            switch (dir.toLowerCase()) {
                case "left":  nx -= step; break;
                case "right": nx += step; break;
                case "up":    ny -= step; break;
                case "down":  ny += step; break;
            }
            if (typeof TileUtils !== "undefined") {
                TileUtils.assignWindowRect(basis, { x: nx, y: ny, width: fg.width, height: fg.height });
            } else {
                basis.frameGeometry = { x: nx, y: ny, width: fg.width, height: fg.height };
            }
            print(`[DirectionalEngine] Nudged floating window '${basis.caption}' ${dir.toUpperCase()}`);
            return;
        }

        // Tiled window: find neighbor and swap
        const neighbor = this.getNeighborByDirection(basis, dir);
        if (!neighbor) {
            print(`[DirectionalEngine] Move ${dir.toUpperCase()}: no adjacent neighbor to swap with.`);
            return;
        }

        print(`[DirectionalEngine] Move ${dir.toUpperCase()}: swapping '${basis.caption}' with '${neighbor.caption}'`);
        if (typeof this.engine.swapWindowsInOrder === "function") {
            this.engine.swapWindowsInOrder(basis, neighbor);
        } else {
            // Fallback direct geometry/tile swap if no order tracking
            const tmpTile = basis.tile;
            basis.tile = neighbor.tile;
            neighbor.tile = tmpTile;
        }

        const output = basis.output || workspace.activeScreen || workspace.screens[0];
        if (output && typeof this.engine.retileScreen === "function") {
            this.engine.retileScreen(output);
        }
        workspace.activeWindow = basis;
    }
