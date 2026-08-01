/**
 * ============================================================================
 * Direktor: All-Floating Layout Engine
 * ============================================================================
 * Disables tiling for all windows on the current monitor/workspace by setting
 * `window.tile = null`. Allows full unconstrained window dragging and resizing.
 */

import { LayoutEngine } from "./LayoutEngine.js";
import { TileUtils } from "../core/TileUtils.js";

export class FloatingLayout extends LayoutEngine {
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
        let staggerCount = 0;
        for (const window of windows) {
            TileUtils.untileWindow(window);
            if (window._lastDirektorLayout !== "floating") {
                let savedGeo = null;
                try {
                    if (this.engine && this.engine.registry && this.engine.registry.windows) {
                        const entry = this.engine.registry.windows.get(window);
                        if (entry && entry.floatingGeometry) savedGeo = entry.floatingGeometry;
                    }
                } catch (e) {}
                const cascadeOffset = this.engine && this.engine.configManager ? (this.engine.configManager.config.general.floatingCascadeOffset || 32) : 32;
                TileUtils.centerAndOptimizeFloatingWindow(window, savedGeo, staggerCount * cascadeOffset);
                staggerCount++;
            }
        }
    }
}
