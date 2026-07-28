# Direktor: Full Stack Documentation & Architecture

Direktor is a next-generation native KWin tiling script for KDE Plasma 6 (Wayland). It abandons the traditional constraints of standard KDE tiling scripts by implementing a robust three-part ecosystem that bypasses Wayland sandboxing restrictions.

---

## 1. Core Architecture & Components
The Direktor ecosystem is strictly modularized into three isolated components that communicate asynchronously.

### A. The KWin Script (`org.kde.kwin.direktor`)
- **Role**: The core tiling engine running directly inside the KWin compositor.
- **Environment**: Executes within KWin's QuickJS engine.
- **Limitations**: Plasma 6 aggressively sandboxes QuickJS. The script cannot read the filesystem, cannot spawn subprocesses, and has extremely limited D-Bus exposure.
- **Structure**:
  - `main.js`: Lifecycle hooks, KWin signal connections, layout application.
  - `LayoutManager.js`: Strategy pattern managing layout engines.
  - `RuleEngine.js`: Regex-based window classification (ignore, float, tile).

### B. The OSD Companion (`direktor-osd`)
- **Role**: A lightweight Python background daemon running in the user session.
- **Purpose**: Bypasses the Wayland limitation where KWin scripts are forbidden from showing On-Screen Displays natively.
- **How it works**: It tails the system journal (`journalctl -f -t kwin_wayland`), captures specific `[Direktor] [OSD]` logs printed by the KWin script, and routes them to Plasma's native `/org/kde/osdService` via D-Bus and `notify-send`.

### C. The Tray Applet (`direktor-tray` / `direktor_gui`)
- **Role**: A native PyQt6 frontend providing real-time layout and gap manipulation.
- **Design**: Built with `Kirigami` and `PlasmaComponents3` to perfectly inherit Klassy/Darkly window decorations, Material You colors, and system transparency without hardcoding CSS.

---

## 2. Communication & IPC Algorithms

Because the three components are sandboxed, Direktor uses highly specific workarounds to communicate:

### Tray -> Script (Triggering Actions)
- **Mechanism**: The KWin script registers native KDE shortcuts using KGlobalAccel.
- **Execution**: When a user clicks a button in the Tray, the Python backend executes:
  `qdbus-qt6 org.kde.kglobalaccel /component/kwin invokeShortcut cycle_layout`

### Tray -> Script (Live Settings / Gaps)
- **The Challenge**: QuickJS caches configuration in an `options` object that only updates if the script restarts or KWin fully reconfigures. Furthermore, slider-dragging (60fps) would crash KWin if we forced a reconfiguration on every tick.
- **The Workaround**: 
  1. The Tray uses `kwriteconfig6` to write directly to `~/.config/kwinrc` under `[Script-direktor]`.
  2. A `QTimer` debounces the user's slider dragging. Exactly 300ms after the drag stops, the Tray fires `qdbus-qt6 org.kde.KWin /KWin reconfigure`.
  3. This forces KWin's `KSharedConfig` to drop its disk cache.
  4. The script intercepts the `options.configChanged` signal, triggers a hot-reload, intentionally ignores its local `options` cache, and executes `KWin.readConfig()` to fetch the live gap values.

---

## 3. KWin API: Utilized & Unutilized Functions

### Utilized Functions & Signals
- **`workspace.windowList()` / `clientList()`**: Actively used to fetch all managed surfaces.
- **`workspace.currentDesktopChanged`**: Hooked to trigger retiling when switching virtual spaces.
- **`window.frameGeometryChanged`**: Captured to detect user-resizing and recalculate proportional split ratios.
- **`window.minimizedChanged` / `window.desktopChanged`**: Utilized as lifecycle hooks to inject or remove windows from the layout tree dynamically.
- **`KWin.readConfig(key)`**: Utilized in conjunction with `KSharedConfig` disk-cache dumping (via `reconfigure`) to fetch live gap settings.
- **`KWin.registerShortcut()`**: Utilized to expose callable actions to KDE's `KGlobalAccel` daemon.

### Unutilized Functions & Bypassed Systems
- **`KWin::TileManager` (Native KDE Tiling API)**: **Unutilized.** Direktor abandons KDE's built-in grid tiling API entirely. Instead, it manages tiling via absolute `frameGeometry` positioning, which allows for vastly more complex fractional splits (like Dwindle and Niri Columns) that the native grid cannot handle.
- **`QTimer` / `Timer`**: **Unutilized.** KWin 6 QuickJS removed native QTimer support. We bypassed this by utilizing a custom `Promise` and KWin's internal event loop for delayed retiling.
- **`XMLHttpRequest`**: **Unutilized.** Banned by Plasma 6 sandbox policies. IPC is routed through D-Bus instead.
- **`callFunction` (D-Bus Scripting Interface)**: **Unutilized.** Plasma 6 dropped the ability to execute script functions via D-Bus arguments. We bypassed this by triggering KGlobalAccel shortcuts instead.

---

## 4. Implemented Features, Inspirations & Algorithms

### A. Implemented Features
- **Real-Time Layout Cycle**: Seamlessly switch between Dwindle, Columns, and Master/Stack on the fly.
- **Dynamic Live Gaps**: Inject uniform or directional padding into the active layout in real-time without script restarts.
- **Wayland OSD Pill**: Native pop-up notifications for layout changes via the `direktor-osd` daemon.
- **Rule Engine**: Regex-based window classification to automatically float dialogs or ignore panels.
- **Floating Glue Prevention**: Automatically tracks and restores `normalWindow` geometry states upon un-tiling.
- **Bismuth / Polonium**: Proven that KWin scripts can rival standalone WMs like Sway.
- **Hyprland**: Provided the conceptual blueprint for the recursive "Dwindle" algorithm.
- **Niri**: Inspired the horizontal "Scrollable Columns" algorithm.

### B. The Algorithms
- **Dwindle Layout**: 
  - Recursively splits the available screen real-estate based on the longest edge (width vs height). 
  - Maintains a binary tree (`node.children`) of windows, calculating ratios and applying gaps mathematically before assigning `frameGeometry`.
- **Columns (Niri-Style)**: 
  - Enforces a fixed maximum width for windows. As new windows open, it conceptually "overflows" them horizontally.
- **TileUtils.js**: 
  - A math engine handling all `QRect` calculations, offset rects for inner/outer gaps, and scaling coordinates for multi-monitor setups.

---

## 5. Quirks, Limitations & Workarounds
1. **The `options` Cache Bug**: Plasma 6 KWin injects an `options` dict at runtime. We had to forcefully bypass this dict using `force=true` in `ConfigManager.js` because it never updates dynamically during hot-reloads.
2. **Missing `QTimer` in QuickJS**: KWin 6 dropped native `QTimer`. We bypassed this by utilizing `Promise` and KWin's internal event loop for delayed retiles.
3. **Dwindle Gap Isolation**: Dwindle layout enforces independent directional gaps (inner horizontal vs outer top, etc). The Tray Applet overrides this by injecting the `Global Padding` value into all 7 KWin gap keys simultaneously when `Uniform Gaps` is checked.

---

## 6. Bug Tracker & Stability

### Stable & Reliable
- IPC communication (Shortcuts, DBus OSD, Debounced Reconfigure).
- Native GUI theme inheritance (Material You + Klassy).
- Master & Stack layout, floating window classification.

### Current / Unfinished Bugs
- **Virtual Desktop Padding Loss**: In "Same Layout All Monitors" mode, switching virtual desktops momentarily zeroes out padding/gaps until a subsequent layout event forces a retile.

### Disappeared / Fixed Bugs
- **Floating Glue Bug**: Previously, switching to "All Floating" caused windows to collapse and glue together. Fixed by tracking and restoring `normalWindow` geometry states upon un-tiling.
- **Dwindle 3rd Window Gap Bug**: Opening a 3rd window caused the 1st to lose padding. Fixed via the `kwinrc` directional gap sync mentioned above.

---

## 7. Roadmap

### Past
- Implemented core KWin logic, Dwindle engine, and RuleEngine.
- Escaped Wayland constraints via the `direktor-osd` Python daemon.

### Current (Phase 3-6)
- Built the PyQt6 `direktor-tray` applet.
- Synchronized KWin `config.ui` (Native Settings) with the Applet GUI.
- Implemented Debounced Config hot-reloading.

### Future (Phase 7: Post-Release)
- **Per-Layout Gap Memory**: Store and apply specific gap configurations depending on the active layout (e.g. 10px for Dwindle, 0px for Master/Stack).
- **Advanced User-Defined Gaps**: Granular control profiles for inner/outer layouts.
- **Exception Watchdog**: Automatic crash archiving and crash-recovery notifications via `direktor-osd`.

---

## 8. Development Insights & Historical Context

To truly understand the evolution of Direktor, it is vital to analyze the development cycles, pain points, and architectural victories that shaped the current codebase.

### Most Used Features So Far
- **The Dwindle Algorithm**: The recursive longest-edge splitting engine has proven to be the most robust and heavily utilized layout out of the gate.
- **Live Gap Adjustments via Tray**: Escaping the necessity of restarting KWin to see padding changes. The real-time slider manipulation provided by the PyQt6 Tray Applet has been the standout quality-of-life feature.

### Once-and-Done Developments (The Smooth Wins)
- **The OSD Companion (`direktor-osd`)**: Once the architecture was designed to pipe KWin journal logs to the Python D-Bus daemon, it worked flawlessly. It bypassed Wayland's strict security policies immediately and has required virtually zero maintenance since.
- **The Rule Engine (Regex Classifier)**: Built to identify and ignore Plasma Panels, splash screens, and dialogs. The regex-matching logic was constructed once and has remained incredibly stable against unexpected window states.

### Constant-Fix Developments (The Pain Points)
- **Gap & Padding Math**: Calculating outer vs inner gaps (specifically inside `DwindleLayout.js` and `TileUtils.js`) required constant iteration. Fractional `QRect` coordinate spaces frequently resulted in overlapping borders or asymmetrical padding until the math was perfectly isolated.
- **Floating Geometry Restoration**: Forcing windows to untile and return to free-floating states (like in the "All Floating" layout) required multiple aggressive rewrites. We had to constantly fight KWin's internal state machine, which would often "glue" windows together or snap them back to their tiled dimensions. 

### Commonly Found Bugs in Development
- **Cache Desynchronization**: The most infamous recurring bug. Python UI would write settings to the disk perfectly, but KWin QuickJS would stubbornly return stale in-memory values from its `options` object during hot-reloads.
- **Tiling Race Conditions**: Retiling windows before KWin had finished allocating their Wayland buffers resulted in windows snapping to `1x1` pixels or getting stuck in the top-left corner. We bypassed this by writing custom `Promise`-based timeout loops since `QTimer` was unavailable.

### Half-Developed & Unfinished Features
- **Per-Layout Memory Profiles**: The backend architecture is prepared to handle different gaps for different layouts (e.g., Dwindle uses 10px, Niri uses 0px). However, the bridge logic to automatically swap these profiles on layout change is currently unfinished and pushed to Phase 7.
- **Desktop Isolation**: The framework to trap windows strictly to their assigned virtual desktops (`toggle_desktop_isolation`) exists in the IPC, but KWin signal limitations currently make it unstable.

---

## 9. Source Code Audit & Codebase Health

An honest analysis of the source code reveals a mix of robust architectural victories, necessary duct-tape patches, and potential future technical debt.

### Permanently Fixed (Solid Architecture)
- **The Wayland OSD Block (`direktor-osd`)**: Bypassing KWin's security block by tailing `journalctl` from a user-session Python daemon is a permanent, native-compliant fix that requires zero dirty KWin hacks.
- **Regex Rule Engine (`RuleEngine.js`)**: The abstraction that categorizes windows (float, ignore, tile) based on `resourceClass` and `caption` is completely decoupled from the layout engines and is rock-solid.
- **Native KGlobalAccel IPC**: Moving away from legacy D-Bus `callFunction` executions to native KDE keyboard shortcut triggers (`invokeShortcut`) guarantees compatibility with future KDE Plasma releases.

### "Patched" (Workarounds & Band-Aids)
- **The Config Cache Bypass (`ConfigManager.js`)**: Modifying `getVal()` to explicitly ignore KWin's injected `options` object if `force=true` is a band-aid over KWin's aggressive QuickJS sandboxing. It works perfectly, but feels like fighting the framework.
- **Promise-Based `setTimeout` (`main.js`)**: Because QuickJS in KWin 6 lacks a native `QTimer`, we had to patch in a custom `Promise` loop hooked into KWin's event cycle to force asynchronous delays for retiling.
- **Dwindle Gap Synchronization (`direktor_gui.py`)**: Because the Dwindle engine mathematically isolates its gap variables, the Tray Applet uses a brute-force patch: when "Uniform Gaps" is checked, it forcefully writes to all 7 specific gap keys in `kwinrc` simultaneously to enforce consistency.

### Questionable Code (Code Smells)
- **Global Window Iteration (`main.js -> retileAllScreens`)**: The engine currently loops over *every single window* in the workspace upon layout changes. This is an $O(n)$ operation. If a user has 100+ windows open across various virtual desktops, this could introduce micro-stutters.
- **Coordinate Rounding (`TileUtils.js`)**: Fractional `QRect` coordinates are forced through `Math.floor()` during scaling calculations. While usually fine, on certain Wayland HiDPI fractional scaling setups, this can rarely result in a 1-pixel gap or overlap between windows.
- **Legacy D-Bus Remnants (`DBusBridge.js`)**: The script still registers actions internally in a way that implies they can be called directly via D-Bus arguments, even though KWin 6 blocked this. It's technically dead code bridging to the Shortcut handler.

### Possible Future Complications, Bugs & Limitations
- **Wayland Buffer Allocation Timing**: If a future KDE Plasma update changes the exact microsecond that Wayland allocates a new window's memory buffer, our custom `Promise` timeouts might fire too early. This will resurrect the dreaded bug where new windows snap to `1x1` pixels.
- **Virtual Desktop Signal Drifts**: KWin's `currentDesktopChanged` signal sometimes fires *before* KWin has finished moving the window objects in memory. This race condition is the root cause of the current "Zero Padding on Desktop Switch" bug, and future KWin updates could make this timing even less predictable.
- **KWin Scripting API Deprecations**: KDE Plasma moves fast. If the `workspace.windowList()` API is ever refactored into a different surface-management API (which is highly likely as Wayland matures), the entire `RuleEngine` and `TileUtils` stack will require a massive rewrite to support the new protocol.
