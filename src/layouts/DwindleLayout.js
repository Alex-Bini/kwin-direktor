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

import { LayoutEngine } from "./LayoutEngine.js";
import { TileUtils } from "../core/TileUtils.js";

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

export class DwindleLayout extends LayoutEngine {
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

        root.box = { x: area.x, y: area.y, width: area.width, height: area.height };
        this._recalcSizePosRecursive(root, { outerTop: 0, outerBottom: 0, outerLeft: 0, outerRight: 0, innerVert: 0, innerHoriz: 0 });

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
        newParent.splitRatio = 1.0;

        newParent.children[0] = targetLeaf;
        newParent.children[1] = newNode;
        targetLeaf.parent = newParent;
        newNode.parent = newParent;

        this._recalcSizePosRecursive(root, { outerTop: 0, outerBottom: 0, outerLeft: 0, outerRight: 0, innerVert: 0, innerHoriz: 0 });
        return root;
    }



    resizeWindow(window, dir, step, output) {
        if (!window || !output || !step) return false;
        const key = this._getKey(output);
        const root = this.trees.get(key);
        if (!root) return false;
        const leaf = this._findLeafByWindow(root, window);
        if (!leaf || !leaf.parent) return false;

        const isVerticalMove = (dir === "up" || dir === "down");
        let curr = leaf;
        while (curr.parent) {
            if (curr.parent.splitTop === isVerticalMove) {
                const boxDim = isVerticalMove ? curr.parent.box.height : curr.parent.box.width;
                if (boxDim <= 0) break;
                const ratioDelta = (step * 2.0) / boxDim;
                const isFirstChild = (curr.parent.children[0] === curr);
                const sign = (dir === "right" || dir === "down") ? 1 : -1;
                const delta = isFirstChild ? (sign * ratioDelta) : (-sign * ratioDelta);
                let newRatio = curr.parent.splitRatio + delta;
                newRatio = Math.min(1.8, Math.max(0.2, newRatio));
                curr.parent.splitRatio = newRatio;
                print(`[Direktor Dwindle] Adjusted splitRatio of container to ${newRatio.toFixed(2)} (${dir})`);
                return true;
            }
            curr = curr.parent;
        }
        return false;
    }

    toggleSplitDirection(window, output) {
        if (!window || !output) return false;
        const key = this._getKey(output);
        const root = this.trees.get(key);
        if (!root) return false;
        
        const leaf = this._findLeafByWindow(root, window);
        if (!leaf || !leaf.parent) return false;
        
        // Invert the split direction of the parent container
        leaf.parent.splitTop = !leaf.parent.splitTop;
        
        // Reset the split ratio to 1.0 since the axis has changed
        leaf.parent.splitRatio = 1.0;
        
        print(`[Direktor Dwindle] Toggled split direction for '${window.caption}'`);
        return true;
    }

    _recalcSizePosRecursive(node, gaps) {
        if (!node) return;

        if (node.isLeaf && node.window) {
            TileUtils.assignWindowRect(node.window, {
                x: node.box.x,
                y: node.box.y,
                width: node.box.width,
                height: node.box.height
            });
            return;
        }

        if (!node.isLeaf && node.children[0] && node.children[1]) {
            const innerHoriz = typeof gaps.innerHoriz === "number" ? gaps.innerHoriz : 8;
            const innerVert = typeof gaps.innerVert === "number" ? gaps.innerVert : 8;

            if (!node.splitTop) {
                // Horizontal split (left / right)
                const availW = Math.max(20, node.box.width - innerHoriz);
                const firstW = Math.floor((availW / 2.0) * node.splitRatio);
                node.children[0].box = { x: node.box.x, y: node.box.y, width: firstW, height: node.box.height };
                node.children[1].box = { x: node.box.x + firstW + innerHoriz, y: node.box.y, width: availW - firstW, height: node.box.height };
            } else {
                // Vertical split (top / bottom)
                const availH = Math.max(20, node.box.height - innerVert);
                const firstH = Math.floor((availH / 2.0) * node.splitRatio);
                node.children[0].box = { x: node.box.x, y: node.box.y, width: node.box.width, height: firstH };
                node.children[1].box = { x: node.box.x, y: node.box.y + firstH + innerVert, width: node.box.width, height: availH - firstH };
            }

            this._recalcSizePosRecursive(node.children[0], gaps);
            this._recalcSizePosRecursive(node.children[1], gaps);
        }
    }

    applyLayout(rootTile, windows, output, surfaceId = null) {
        const key = surfaceId || this._getKey(output);
        if (!windows || windows.length === 0 || !output) {
            this.trees.delete(key);
            return;
        }

        const area = TileUtils.getUsableArea(output, windows[0]);
        const gen = (this.engine && this.engine.configManager && typeof this.engine.configManager.getGeneralSettings === "function") ? this.engine.configManager.getGeneralSettings() : {};
        let gaps = { outerTop: 8, outerBottom: 8, outerLeft: 8, outerRight: 8, innerVert: 8, innerHoriz: 8 };
        if (this.engine && this.engine.configManager && typeof this.engine.configManager.getGapsForLayout === "function") {
            gaps = this.engine.configManager.getGapsForLayout(this.id);
        }


        let root = this.trees.get(key) || null;

        const currentLeaves = this._getAllLeaves(root);
        for (let i = 0; i < currentLeaves.length; i++) {
            const leaf = currentLeaves[i];
            if (!windows.includes(leaf.window)) {
                root = this._removeNode(root, leaf);
            }
        }

        const updatedLeaves = this._getAllLeaves(root);
        const activeWin = (typeof workspace !== "undefined" && workspace.activeWindow) ? workspace.activeWindow : null;

        for (let i = 0; i < windows.length; i++) {
            const win = windows[i];
            if (!updatedLeaves.some(l => l.window === win)) {
                const targetWin = (i === 0 && updatedLeaves.length === 0) ? activeWin : null;
                root = this._insertWindow(root, win, area, targetWin);
                updatedLeaves.push({ window: win });
            }
        }

        this.trees.set(key, root);

        if (root) {
            root.box = {
                x: area.x + gaps.outerLeft,
                y: area.y + gaps.outerTop,
                width: Math.max(100, area.width - (gaps.outerLeft + gaps.outerRight)),
                height: Math.max(100, area.height - (gaps.outerTop + gaps.outerBottom))
            };
            this._recalcSizePosRecursive(root, gaps);
        }
    }

    swapWindows(winA, winB, output) {
        if (!winA || !winB || winA === winB || !output) return false;
        const key = this._getKey(output);
        const root = this.trees.get(key);
        if (!root) return false;
        const leafA = this._findLeafByWindow(root, winA);
        const leafB = this._findLeafByWindow(root, winB);
        if (leafA && leafB) {
            leafA.window = winB;
            leafB.window = winA;
            print(`[Direktor Dwindle] Swapped tree nodes between '${winA.caption}' and '${winB.caption}'`);
            return true;
        }
        return false;
    }

    handleWindowInteractiveEvent(window, output, windows, isDrop = false) {
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
        // Intended goal: array-like shift replacement.
        if (isDrop) {
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
