class DwindleNode {
    constructor(window) {
        this.window = window;
        this.children = [null, null];
        this.parent = null;
        this.box = { x: 0, y: 0, width: 0, height: 0 };
        this.splitTop = false;
        this.splitRatio = 1.0;
    }
    get isLeaf() {
        return !this.children[0] && !this.children[1];
    }
}

class DwindleLayoutMock {
    constructor() {
        this.dwindleConfig = { forceSplit: 0, defaultSplitRatio: 1.0 };
    }

    _getLastLeaf(node) {
        if (!node) return null;
        if (node.isLeaf) return node;
        return this._getLastLeaf(node.children[1]) || this._getLastLeaf(node.children[0]);
    }

    _recalcSizePosRecursive(node, gaps) {
        if (!node) return;
        if (node.isLeaf && node.window) return;

        const splitTop = node.splitTop;
        const ratio = node.splitRatio || 1.0;
        let child1Box, child2Box;
        if (splitTop) {
            const h1 = Math.floor((node.box.height - gaps.innerVert) / (1 + ratio));
            const h2 = node.box.height - gaps.innerVert - h1;
            child1Box = { x: node.box.x, y: node.box.y, width: node.box.width, height: h1 };
            child2Box = { x: node.box.x, y: node.box.y + h1 + gaps.innerVert, width: node.box.width, height: h2 };
        } else {
            const w1 = Math.floor((node.box.width - gaps.innerHoriz) / (1 + ratio));
            const w2 = node.box.width - gaps.innerHoriz - w1;
            child1Box = { x: node.box.x, y: node.box.y, width: w1, height: node.box.height };
            child2Box = { x: node.box.x + w1 + gaps.innerHoriz, y: node.box.y, width: w2, height: node.box.height };
        }
        node.children[0].box = child1Box;
        node.children[1].box = child2Box;
        this._recalcSizePosRecursive(node.children[0], gaps);
        this._recalcSizePosRecursive(node.children[1], gaps);
    }

    _insertWindow(root, newWin, area) {
        if (!root) {
            const node = new DwindleNode(newWin);
            node.box = { x: area.x, y: area.y, width: area.width, height: area.height };
            return node;
        }

        root.box = { x: area.x, y: area.y, width: area.width, height: area.height };
        this._recalcSizePosRecursive(root, { outerTop: 0, outerBottom: 0, outerLeft: 0, outerRight: 0, innerVert: 0, innerHoriz: 0 });

        let targetLeaf = this._getLastLeaf(root);
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
        newParent.splitTop = (newParent.box.height > newParent.box.width);
        newParent.splitRatio = 1.0;

        newParent.children[0] = targetLeaf;
        newParent.children[1] = newNode;
        targetLeaf.parent = newParent;
        newNode.parent = newParent;

        this._recalcSizePosRecursive(root, { outerTop: 0, outerBottom: 0, outerLeft: 0, outerRight: 0, innerVert: 0, innerHoriz: 0 });
        return root;
    }
}

const mock = new DwindleLayoutMock();
const area = { x: 0, y: 0, width: 1920, height: 1080 };
let root = null;
root = mock._insertWindow(root, "Win1", area);
console.log("After Win1:", JSON.stringify(root.box));
root = mock._insertWindow(root, "Win2", area);
console.log("After Win2, root:", root.splitTop, root.children[0].box, root.children[1].box);
root = mock._insertWindow(root, "Win3", area);
console.log("After Win3, root splitTop:", root.splitTop);
console.log("Win1 box:", root.children[0].box);
console.log("Win2 box:", root.children[1].children[0].box);
console.log("Win3 box:", root.children[1].children[1].box);
