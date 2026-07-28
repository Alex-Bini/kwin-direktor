/**
 * ============================================================================
 * Direktor: Layout Manager
 * ============================================================================
 * Coordinates all available layout engines, tracks per-output active layout,
 * and handles layout cycling and application.
 */

import { DwindleLayout } from "./DwindleLayout.js";
import { ScrollableNiriLayout } from "./ScrollableNiriLayout.js";
import { FloatingLayout } from "./FloatingLayout.js";
import { MasterStackLayout } from "./MasterStackLayout.js";
import { TileUtils } from "../core/TileUtils.js";

export class LayoutManager {
    constructor(engine = null) {
        this.engine = engine;
        this.layouts = new Map();
        this.activeLayoutIdBySurface = new Map();

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
        layoutEngine.engine = this.engine;
        this.layouts.set(layoutEngine.id, layoutEngine);
    }

    getLayout(layoutId) {
        return this.layouts.get(layoutId) || this.layouts.get("dwindle");
    }

    getActiveLayoutId(surfaceId) {
        if (this.activeLayoutIdBySurface.has(surfaceId)) {
            return this.activeLayoutIdBySurface.get(surfaceId);
        }
        
        let def = "dwindle";
        if (this.engine && this.engine.configManager && typeof this.engine.configManager.getGeneralSettings === "function") {
            const gen = this.engine.configManager.getGeneralSettings();
            if (gen.startFloatingDefault === true) {
                def = "floating";
            } else if (gen.defaultLayout) {
                def = gen.defaultLayout;
            }
        }
        
        return def;
    }

    getActiveLayout(surfaceId) {
        const layoutId = this.getActiveLayoutId(surfaceId);
        return this.getLayout(layoutId);
    }

    setActiveLayoutId(surfaceId, layoutId) {
        if (this.layouts.has(layoutId)) {
            const oldId = this.activeLayoutIdBySurface.get(surfaceId);
            if (oldId !== layoutId) {
                try {
                    const dwindle = this.layouts.get("dwindle");
                    if (dwindle && typeof dwindle.trees !== "undefined") dwindle.trees.clear();
                } catch (e) {}
                try {
                    const wins = TileUtils.getWorkspaceWindows();
                    for (const w of wins) {
                        if (w) {
                            delete w._direktorFloatingLayoutApplied;
                            TileUtils.untileWindow(w);
                        }
                    }
                } catch (e) {}
                try {
                    if (this.engine && this.engine.registry) {
                        const wins = TileUtils.getWorkspaceWindows();
                        const sortedByAbs = this.engine.registry.sortWindows(wins, false);
                        for (const w of sortedByAbs) {
                            const entry = this.engine.registry.getEntry(w);
                            if (entry && typeof entry.absoluteOrder === "number") {
                                entry.layoutPosition = entry.absoluteOrder;
                            }
                        }
                        if (this.engine.windowOrderMap) {
                            if (this.engine.windowOrderMap.has(surfaceId)) {
                                const list = this.engine.windowOrderMap.get(surfaceId);
                                this.engine.windowOrderMap.set(surfaceId, this.engine.registry.sortWindows(list, false));
                            }
                        }
                    }
                } catch (e) {}
            }
            this.activeLayoutIdBySurface.set(surfaceId, layoutId);
        }
    }

    cycleNextLayout(surfaceId) {
        let activeOrder = [];
        if (this.engine && this.engine.configManager && typeof this.engine.configManager.getGeneralSettings === "function") {
            const gen = this.engine.configManager.getGeneralSettings();
            if (gen.cycleDwindle !== false) activeOrder.push("dwindle");
            if (gen.cycleColumns !== false) activeOrder.push("niri-scrollable");
            if (gen.cycleMaster !== false) activeOrder.push("master-stack");
            if (gen.cycleFloating !== false) activeOrder.push("floating");
        }
        
        // Fallback if all are somehow disabled
        if (activeOrder.length === 0) activeOrder = this.layoutOrder;

        const currentId = this.getActiveLayoutId(surfaceId);
        const currentIdx = activeOrder.indexOf(currentId);
        
        // If current layout is not in active rotation, just start from index 0
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % activeOrder.length;
        const nextId = activeOrder[nextIdx];
        
        this.setActiveLayoutId(surfaceId, nextId);
        return this.getLayout(nextId);
    }

    /**
     * Recomputes and applies the active layout for a given surface.
     * @param {KWin.TileManager} tileManager
     * @param {KWin.Window[]} windows
     * @param {string} surfaceId
     */
    applyLayoutToSurface(tileManager, windows, surfaceId, output) {
        print(`[Direktor] applyLayoutToSurface CALLED for surfaceId: ${surfaceId}`);
        try {
            if (!tileManager || !tileManager.rootTile || !windows) {
                print(`[Direktor] applyLayoutToSurface returning early due to invalid args: tm=${!!tileManager}, rootTile=${tileManager ? !!tileManager.rootTile : false}, windows=${!!windows}`);
                return;
            }
            const layoutId = this.getActiveLayoutId(surfaceId);
            const layoutEngine = this.getLayout(layoutId);

            // Reset root tile tree so layout engine can build cleanly
            TileUtils.resetRootTile(tileManager.rootTile);

            // Execute active layout engine
            layoutEngine.applyLayout(tileManager.rootTile, windows, output, surfaceId);
            
            // Track last applied layout state
            for (const w of windows) {
                if (w) w._lastDirektorLayout = layoutId;
            }
        } catch (e) {
            print(`[Direktor] CRITICAL ERROR in applyLayoutToSurface: ${e}\n${e.stack}`);
        }
    }

    swapWindows(winA, winB, surfaceId, output) {
        if (!surfaceId || !output) return false;
        const layoutId = this.getActiveLayoutId(surfaceId);
        const layoutEngine = this.getLayout(layoutId);
        if (layoutEngine && typeof layoutEngine.swapWindows === "function") {
            return layoutEngine.swapWindows(winA, winB, output);
        }
        return false;
    }
}
