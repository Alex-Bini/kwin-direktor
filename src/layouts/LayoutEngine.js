/**
 * ============================================================================
 * Direktor Base Layout Engine Interface
 * ============================================================================
 * All Direktor layout engines (Dwindle, Niri Scrollable, Master-Stack, Floating)
 * extend this abstract base class.
 */

export class LayoutEngine {
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
