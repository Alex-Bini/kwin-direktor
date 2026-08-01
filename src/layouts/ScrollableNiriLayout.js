/**
 * ============================================================================
 * Direktor: Scrollable Column Layout Engine (True Niri/Karousel Style)
 * ============================================================================
 * Organizes windows into horizontal columns across an infinite logical viewport.
 * Vertical stacking has been deferred to Phase 4. Each window takes 100% height.
 */

import { LayoutEngine } from "./LayoutEngine.js";
import { TileUtils } from "../core/TileUtils.js";

export class ScrollableNiriLayout extends LayoutEngine {
    constructor() {
        super("niri-scrollable", "Scrollable Columns (Niri)");
        // Map: "outputName_desktopId" -> current left-most visible column index (or scroll pixel offset)
        this.scrollOffsets = new Map();
        // Map: String(window.internalId) -> custom user-defined width percentage (0.1 to 1.0)
        this.customWidths = new Map();
    }

    applyLayout(rootTile, windows, output) {
        if (!windows || windows.length === 0 || !output) return;

        const area = TileUtils.getUsableArea(output, windows[0]);
        let gaps = { outerTop: 8, outerBottom: 8, outerLeft: 8, outerRight: 8, innerVert: 8, innerHoriz: 8 };
        if (this.engine && this.engine.configManager && typeof this.engine.configManager.getGapsForLayout === "function") {
            gaps = this.engine.configManager.getGapsForLayout(this.id);
        }
        
        const outerTop = gaps.outerTop;
        const outerBottom = gaps.outerBottom;
        const outerLeft = gaps.outerLeft;
        const outerRight = gaps.outerRight;
        const innerHoriz = gaps.innerHoriz;

        const safeArea = {
            x: area.x + outerLeft,
            y: area.y + outerTop,
            width: Math.max(100, area.width - (outerLeft + outerRight)),
            height: Math.max(100, area.height - (outerTop + outerBottom))
        };

        const currentDesktop = typeof workspace !== "undefined" && workspace.currentDesktop ? 
            (workspace.currentDesktop.id || workspace.currentDesktop) : "default";
        const stateKey = output.name + "_" + currentDesktop;

        const gen = (this.engine && this.engine.configManager && typeof this.engine.configManager.getGeneralSettings === "function") ? this.engine.configManager.getGeneralSettings() : {};
        const widthOne = typeof gen.niriWidthOne === "number" ? gen.niriWidthOne / 100 : 1.0;
        const widthTwo = typeof gen.niriWidthTwo === "number" ? gen.niriWidthTwo / 100 : 0.5;
        const widthThree = typeof gen.niriWidthThree === "number" ? gen.niriWidthThree / 100 : 0.4;
        const scrollMode = gen.niriScrollingMode || 0; // 0 = Niri, 1 = Karousel

        // Calculate custom and default widths for every window
        const colWidths = windows.map(w => {
            let width = 0;
            if (this.customWidths.has(String(w.internalId))) {
                width = Math.floor(safeArea.width * this.customWidths.get(String(w.internalId)));
            } else if (windows.length === 1) {
                width = Math.floor(safeArea.width * widthOne);
            } else if (windows.length === 2) {
                width = Math.floor(safeArea.width * widthTwo);
            } else {
                width = Math.floor(safeArea.width * widthThree);
            }
            
            // Issue #3: Respect rigid minimum widths to prevent horizontal overlap
            if (w && w.minSize && typeof w.minSize.width === "number" && w.minSize.width > width) {
                width = w.minSize.width;
            }
            
            // Issue #3 (Advanced): Respect actual settled widths from the Watchdog
            if (w && typeof w._direktorMinEffectiveWidth === "number" && w._direktorMinEffectiveWidth > width) {
                width = w._direktorMinEffectiveWidth;
            }
            return width;
        });

        // Find the active window to ensure it stays in the viewport
        let activeIdx = 0;
        if (typeof workspace !== "undefined" && workspace.activeWindow) {
            const idx = windows.indexOf(workspace.activeWindow);
            if (idx !== -1) activeIdx = idx;
        }

        // Current scroll offset (in terms of pixels)
        let currentScrollPx = this.scrollOffsets.get(stateKey) || 0;

        // Calculate the absolute pixel bounds of the active window
        let activeWinLeft = 0;
        for (let i = 0; i < activeIdx; i++) {
            activeWinLeft += colWidths[i] + innerHoriz; // Add gap between columns
        }
        const activeWinWidth = colWidths[activeIdx];
        const activeWinRight = activeWinLeft + activeWinWidth;

        // Auto-pan logic
        let minX = 0;
        let maxX = Math.max(0, safeArea.width - activeWinWidth);
        
        if (scrollMode === 0) { // Niri Style (Strict Center)
            minX = Math.floor((safeArea.width - activeWinWidth) / 2);
            maxX = minX;
        } else { // Karousel Style (Center Pairs)
            if (windows.length > 2) {
                let defaultW = Math.floor(safeArea.width * widthThree);
                minX = Math.floor((safeArea.width - activeWinWidth - defaultW - innerHoriz) / 2);
                maxX = safeArea.width - activeWinWidth - minX;
            }
        }

        if (activeWinLeft - currentScrollPx < minX) {
            currentScrollPx = activeWinLeft - minX;
        } else if (activeWinLeft - currentScrollPx > maxX) {
            currentScrollPx = activeWinLeft - maxX;
        }

        // Clamp the scroll offset so we don't pan out of bounds
        const totalContentWidth = colWidths.reduce((a, b) => a + b, 0) + (windows.length > 1 ? (windows.length - 1) * innerHoriz : 0);
        const maxScrollPx = Math.max(0, totalContentWidth - safeArea.width);
        
        if (currentScrollPx > maxScrollPx) currentScrollPx = maxScrollPx;
        if (currentScrollPx < 0) currentScrollPx = 0;

        this.scrollOffsets.set(stateKey, currentScrollPx);

        // Assign geometries
        let currentX = safeArea.x - currentScrollPx;
        for (let i = 0; i < windows.length; i++) {
            const w = colWidths[i];
            
            // True Niri/Karousel behavior: 100% vertical space per window
            TileUtils.assignWindowRect(windows[i], {
                x: currentX,
                y: safeArea.y,
                width: w,
                height: safeArea.height,
                allowOffscreenX: true
            });
            
            currentX += w + innerHoriz;
        }
    }

    handleWindowInteractiveEvent(window, output, windows, isDrop = false) {
        if (!window || !windows) return;

        let didSwap = false;
        const geom = window.frameGeometry;
        if (!geom) return;

        // 1. Check if the user is drag-swapping to change window order
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
                            
                            // Swap custom widths (so they swap sizes as well)
                            const widthA = this.customWidths.get(String(window.internalId));
                            const widthB = this.customWidths.get(String(target.internalId));
                            
                            if (widthA !== undefined) this.customWidths.set(String(target.internalId), widthA);
                            else this.customWidths.delete(String(target.internalId));
                            
                            if (widthB !== undefined) this.customWidths.set(String(window.internalId), widthB);
                            else this.customWidths.delete(String(window.internalId));

                            print(`[Direktor Niri] Swapped places and sizes between '${window.caption}' and '${target.caption}'`);
                            didSwap = true;
                        }
                    }
                    break;
                }
            }
        }

        // 2. Check if the user resized the window border (only if we didn't just swap them)
        if (!didSwap) {
            const area = TileUtils.getUsableArea(output, window);
            if (area && area.width > 0) {
                // Calculate difference to confirm it was an actual resize
                const expectedW = this.customWidths.get(String(window.internalId)) 
                    ? Math.floor(area.width * this.customWidths.get(String(window.internalId)))
                    : (windows.length === 1 ? area.width : (windows.length === 2 ? Math.floor(area.width / 2) : Math.floor(area.width * 0.40)));
                
                if (Math.abs(geom.width - expectedW) > 10) {
                    let newRatio = geom.width / area.width;
                    newRatio = Math.max(0.1, Math.min(newRatio, 1.0));
                    this.customWidths.set(String(window.internalId), newRatio);
                    
                    // Clear the watchdog's settled width cache, because the user just manually resized it
                    if (window._direktorMinEffectiveWidth) {
                        delete window._direktorMinEffectiveWidth;
                    }
                    print(`[Direktor Niri] Set custom width ratio for '${window.caption}' to ${newRatio.toFixed(2)}`);
                }
            }
        }
    }

    resizeWindow(window, dir, step, output) {
        if (!window || !output) return false;
        
        // Niri columns only support horizontal resizing in our current Phase 3 implementation
        if (dir === "up" || dir === "down") return false;

        const area = TileUtils.getUsableArea(output, window);
        if (!area || area.width === 0) return false;

        // Current assigned width ratio (or default)
        let currentRatio = this.customWidths.get(String(window.internalId));
        if (!currentRatio) {
            // Find total windows to calculate default ratio
            const allWindows = TileUtils.getWorkspaceWindows();
            const desktop = typeof workspace !== "undefined" && workspace.currentDesktop ? (workspace.currentDesktop.id || workspace.currentDesktop) : "default";
            let total = 0;
            for (let i = 0; i < allWindows.length; i++) {
                const w = allWindows[i];
                if (w && w.normalWindow && !w.minimized && TileUtils.isWindowOnScreen(w, output) && TileUtils.isWindowOnDesktop(w, desktop)) {
                    total++;
                }
            }
            if (total === 1) currentRatio = 1.0;
            else if (total === 2) currentRatio = 0.5;
            else currentRatio = 0.40;
        }

        // Convert the step (usually pixels like 40px) into a ratio percentage
        const ratioStep = step / area.width;
        
        // If dir is 'right', we increase width. If 'left', we decrease width.
        // Wait, normally 'right' on the right border increases size, but we just want general increase/decrease.
        // For simplicity, let's just make 'right' increase and 'left' decrease.
        let newRatio = currentRatio;
        if (dir === "right") newRatio += ratioStep;
        else if (dir === "left") newRatio -= ratioStep;

        newRatio = Math.max(0.1, Math.min(newRatio, 1.0));
        
        this.customWidths.set(String(window.internalId), newRatio);
        print(`[Direktor Niri] Keyboard resized '${window.caption}' to ${newRatio.toFixed(2)}`);
        return true;
    }
}
