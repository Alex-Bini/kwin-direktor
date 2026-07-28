/**
 * ============================================================================
 * Minimal "Direktor" Hello World Wrapper Script (Plasma 6 / Wayland-First)
 * ============================================================================
 * Demonstrates:
 * 1. Connecting to `workspace.windowAdded` & `workspace.windowRemoved`
 * 2. Grabbing native `TileManager` via `workspace.tilingForScreen(output)`
 * 3. Wayland-safe tiling via assigning `window.tile = tileNode`
 * 4. D-Bus interface concept & shortcut registration
 */

const DIRECTION_HORIZONTAL = 0;
const DIRECTION_VERTICAL = 1;

class DirektorMinimal {
    constructor() {
        print("[DirektorMinimal] Initializing Plasma 6 Tiling Director...");
        this.initSignals();
        this.registerKeybinds();
    }

    initSignals() {
        // Intercept new windows before/during rendering
        workspace.windowAdded.connect((window) => {
            this.handleWindowAdded(window);
        });

        // Handle window removals to re-balance
        workspace.windowRemoved.connect((window) => {
            print(`[DirektorMinimal] Window removed: ${window.caption}`);
        });
    }

    handleWindowAdded(window) {
        // Skip popups, dialogs, splash screens, or non-normal windows
        if (!window.normalWindow || window.dialog || window.splash) {
            return;
        }

        print(`[DirektorMinimal] Tiling window: ${window.caption} (${window.resourceClass})`);

        // Grab physical output screen
        const output = window.output;
        if (!output) return;

        // Grab native C++ TileManager for this screen
        const tileManager = workspace.tilingForScreen(output);
        if (!tileManager || !tileManager.rootTile) return;

        const rootTile = tileManager.rootTile;

        // Ensure root tile is split into at least two columns (master & stack)
        if (rootTile.childTiles.length === 0) {
            rootTile.split(DIRECTION_HORIZONTAL);
        }

        // Wayland-first: Assign window to the first child tile
        // NEVER set window.geometry directly on Wayland!
        const targetTile = rootTile.childTiles[0];
        window.tile = targetTile;
    }

    registerKeybinds() {
        workspace.registerShortcut(
            "Direktor: Toggle Floating",
            "Direktor: Toggle Active Window Floating State",
            "Meta+Shift+F",
            () => {
                const active = workspace.activeWindow;
                if (!active || !active.normalWindow) return;

                if (active.tile !== null) {
                    print(`[DirektorMinimal] Floating active window: ${active.caption}`);
                    active.tile = null; // Setting null untiles window
                } else {
                    this.handleWindowAdded(active);
                }
            }
        );
    }
}

// Instantiate the Director engine
const direktorEngine = new DirektorMinimal();
