/**
 * ============================================================================
 * Direktor: Master-Stack Layout Engine (DWM / Krohnkite style)
 * ============================================================================
 * Splits the screen into two main columns:
 * - Left column: Master area holding the primary window(s)
 * - Right column: Stack area holding remaining windows split vertically
 */

import { LayoutEngine } from "./LayoutEngine.js";
import { TileUtils } from "../core/TileUtils.js";

export class MasterStackLayout extends LayoutEngine {
    constructor(masterCount = 1, masterRatio = 0.55) {
        super("master-stack", "Master & Stack");
        this.masterCount = masterCount;
        this.masterRatio = masterRatio;
    }

    applyLayout(rootTile, windows, output) {
        if (!windows || windows.length === 0 || !output) return;

        const area = TileUtils.getUsableArea(output, windows[0]);
        let gaps = { outerTop: 8, outerBottom: 8, outerLeft: 8, outerRight: 8, innerVert: 8, innerHoriz: 8 };
        if (this.engine && this.engine.configManager && typeof this.engine.configManager.getGapsForLayout === "function") {
            gaps = this.engine.configManager.getGapsForLayout(this.id);
        }

        if (windows.length === 1) {
            TileUtils.assignWindowRect(windows[0], {
                x: area.x + gaps.outerLeft,
                y: area.y + gaps.outerTop,
                width: area.width - (gaps.outerLeft + gaps.outerRight),
                height: area.height - (gaps.outerTop + gaps.outerBottom)
            });
            return;
        }

        const masterW = Math.floor(area.width * this.masterRatio);
        const stackW = area.width - masterW;

        // Master window on the left
        TileUtils.assignWindowRect(windows[0], {
            x: area.x + gaps.outerLeft,
            y: area.y + gaps.outerTop,
            width: masterW - gaps.outerLeft - Math.floor(gaps.innerHoriz / 2),
            height: area.height - (gaps.outerTop + gaps.outerBottom)
        });

        // Stack windows on the right, stacked vertically
        const numStack = windows.length - 1;
        const sliceH = Math.floor(area.height / numStack);
        for (let i = 1; i < windows.length; i++) {
            const rowIdx = i - 1;
            const yOffset = rowIdx * sliceH;
            const h = (rowIdx === numStack - 1) ? (area.height - yOffset) : sliceH;
            
            const topGap = (rowIdx === 0) ? gaps.outerTop : Math.floor(gaps.innerVert / 2);
            const bottomGap = (rowIdx === numStack - 1) ? gaps.outerBottom : Math.floor(gaps.innerVert / 2);
            
            TileUtils.assignWindowRect(windows[i], {
                x: area.x + masterW + Math.ceil(gaps.innerHoriz / 2),
                y: area.y + yOffset + topGap,
                width: stackW - gaps.outerRight - Math.ceil(gaps.innerHoriz / 2),
                height: h - topGap - bottomGap
            });
        }
    }

    handleWindowInteractiveEvent(window, output, windows, isDrop = false) {
        if (!window || !windows) return;

        const geom = window.frameGeometry;
        if (!geom) return;

        if (isDrop) {
            const centerX = geom.x + geom.width / 2.0;
            const centerY = geom.y + geom.height / 2.0;

            for (let i = 0; i < windows.length; i++) {
                const target = windows[i];
                if (target === window || !target.frameGeometry) continue;

                const tx = target.frameGeometry.x;
                const ty = target.frameGeometry.y;
                const tw = target.frameGeometry.width;
                const th = target.frameGeometry.height;

                // If mouse drop coordinates are inside another window
                if (centerX >= tx && centerX <= tx + tw && centerY >= ty && centerY <= ty + th) {
                    if (this.engine && this.engine.registry) {
                        const entryA = this.engine.registry.getEntry(window);
                        const entryB = this.engine.registry.getEntry(target);
                        if (entryA && entryB && typeof entryA.layoutPosition === "number" && typeof entryB.layoutPosition === "number") {
                            // Swap layout positions (so they change places in the layout order)
                            const tempPos = entryA.layoutPosition;
                            entryA.layoutPosition = entryB.layoutPosition;
                            entryB.layoutPosition = tempPos;
                            
                            print(`[Direktor MasterStack] Swapped places between '${window.caption}' and '${target.caption}'`);
                            break;
                        }
                    }
                }
            }
        }
    }
}
