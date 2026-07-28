/**
 * ============================================================================
 * KWin Plasma 6 Scripting API Declarations (TypeScript / JavaScript)
 * ============================================================================
 * Authoritative reference declarations for KWin Plasma 6 Scripting.
 * Reference: https://develop.kde.org/docs/plasma/kwin/api/
 *            https://zeroxoneafour.github.io/kwin-scripting-docs/
 */

declare namespace KWin {
    /**
     * Physical display monitor / output screen.
     */
    interface Output {
        readonly name: string;
        readonly geometry: Qt.QRectF;
        readonly workArea: Qt.QRectF;
    }

    /**
     * Tile node representing a layout container in Wayland/X11.
     */
    interface Tile {
        readonly parentTile: Tile | null;
        readonly childTiles: Tile[];
        relativeGeometry: Qt.QRectF;
        readonly absoluteGeometry: Qt.QRectF;
        padding: number;
        readonly isLayout: boolean;

        /**
         * Split this tile horizontally (side by side) or vertically (top & bottom).
         * @param direction 0 = Horizontal, 1 = Vertical
         */
        split(direction: number): void;
    }

    /**
     * Root tile manager for a specific Output.
     */
    interface TileManager {
        readonly rootTile: Tile;
        readonly output: Output;
    }

    /**
     * Client / Window object representing an application window.
     */
    interface Window {
        readonly caption: string;
        readonly resourceClass: string;
        readonly resourceName: string;
        readonly dialog: boolean;
        readonly normalWindow: boolean;
        readonly splash: boolean;
        readonly utility: boolean;

        /**
         * [THE GOLDEN PROPERTY]
         * Assigning a Tile object tiles the window natively in Wayland/X11.
         * Assigning null untiles/floats the window.
         */
        tile: Tile | null;

        output: Output;
        minimized: boolean;
        fullScreen: boolean;
        keepAbove: boolean;
        keepBelow: boolean;

        /**
         * Signals emitted by this window.
         */
        readonly closed: QtSignal<() => void>;
        readonly outputChanged: QtSignal<() => void>;
        readonly interactiveMoveResizeFinished: QtSignal<() => void>;
    }

    interface QtSignal<T extends (...args: any[]) => void> {
        connect(slot: T): void;
        disconnect(slot: T): void;
    }

    /**
     * Global Workspace interface providing access to windows, outputs, and tiling managers.
     */
    interface Workspace {
        readonly activeWindow: Window | null;
        readonly windowList: Window[];
        readonly screens: Output[];

        /**
         * Returns the native TileManager for the specified physical output monitor.
         */
        tilingForScreen(output: Output): TileManager;

        /**
         * Register a global keyboard shortcut tied to a JavaScript function callback.
         */
        registerShortcut(
            id: string,
            description: string,
            keySequence: string,
            callback: () => void
        ): void;

        /**
         * Signals emitted on lifecycle events.
         */
        readonly windowAdded: QtSignal<(window: Window) => void>;
        readonly windowRemoved: QtSignal<(window: Window) => void>;
        readonly windowActivated: QtSignal<(window: Window) => void>;
        readonly screensChanged: QtSignal<() => void>;
    }
}

declare const workspace: KWin.Workspace;
declare const print: (...args: any[]) => void;
