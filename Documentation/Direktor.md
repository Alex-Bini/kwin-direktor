# Direktor: Complete Architectural & User Documentation

**Direktor** is a native, Wayland-first, JSON-configured tiling window manager and layout controller for KDE Plasma 6 (`KWin`).

Unlike legacy X11 scripts that force absolute pixel coordinates (`window.geometry = {x,y,w,h}`), Direktor acts as the **Director** while KWin acts as the **Animator**: assigning application windows to logical Wayland `Tile` structures (`window.tile = targetTile`) or exact non-overlapping grid cells (`TileUtils.assignWindowRect`).

---

## 1. Core Features & Recent Additions

### A. Supercharged Differential Hot-Reload (`Meta+Shift+R` or System Settings Apply)
* **Zero Session Restart:** Instantly reloads settings from `kwinrc`, external `rules.json`, and layout configs without restarting KWin (preventing Wayland logout).
* **Differential Lifecycle Evaluation:** Re-evaluates every currently open window against updated rules. If a rule changes a window from `tile` to `float` or `ignore` (or vice versa), Direktor dynamically untiles or tiles the affected windows immediately.

### B. Optimal Floating Window Centering & Sizing (`TileUtils.centerAndOptimizeFloatingWindow`)
* When toggling a window from Tiled to Floating (`Meta+Shift+F`) or when a floating rule applies:
  * **Smart Sizing:** If the window was previously full screen, maximized, or too small (`<300x200`), Direktor computes optimal floating dimensions (`~65% width x ~68% height` of usable screen area).
  * **App Preferences:** Respects the application's `minSize` and `maxSize` hints.
  * **Exact Centering:** Positions the floating window precisely in the center of the active monitor.

### C. Fine-Grained Dwindle Gap Control & Interactive Live 3-Window Preview
Inside **System Settings > KWin Scripts > Direktor > Configure > Dwindle Layout & Gaps**:
* **6 Independent Gap Controls (0–128 px):** Upper Outer Gap (`dwindleOuterGapTop`), Lower Outer Gap (`dwindleOuterGapBottom`), Left Outer Gap (`dwindleOuterGapLeft`), Right Outer Gap (`dwindleOuterGapRight`), Between Apps Vertical Gap (`dwindleInnerGapVertical`), and Between Apps Horizontal Gap (`dwindleInnerGapHorizontal`).
* **Live 3-Window Demonstration:** An interactive monitor frame displaying 3 Dwindle windows. As you adjust or spin any gap value, native Qt `<connections>` instantly resize the preview margins and spacing right before your eyes.
* **Exact Mathematical Splitting:** The Dwindle tree engine (`DwindleLayout.js`) subtracts outer gaps from the monitor root box and inner gaps between child splits, ensuring exact pixel boundaries.

### D. Real-Time In-Memory Ring Buffer & File Logger (`Logger.js`)
* **Zero-Lag Ring Buffer:** Captures up to 1000 recent execution events, window registrations, floating toggles, rule evaluations, layout cycles, and errors inside RAM without disk I/O latency.
* **System Settings Viewer (`tabLogs`):** View, select (`Ctrl+A`), and copy (`Ctrl+C`) the real-time execution logs directly inside the **Logs & Diagnostics** tab in System Settings.
* **Disk Snapshotting:** Automatically dumps the RAM log buffer to `/home/tcone/.config/direktor/log.txt` on hot-reload (`Meta+Shift+R`) or on-demand via D-Bus (`dump_logs`).

### E. Plasma 6 OSD Notifications (`PlasmaCore.Dialog`)
* Displays elegant on-screen popups confirming layout switches (`"Layout: Dwindle"`), promotion actions, and configuration reloads.

---

## 2. Event-Driven Tiling Lifecycle (No Polling)

Direktor is **100% event-driven** and does **not** poll or run on a continuous `setInterval` timer. It calculates and retiles window positions exactly when needed:
1. **Window Add / Remove / Minimize / Unminimize:** Triggered instantly via `workspace.windowAdded`, `workspace.windowRemoved`, or `window.minimizedChanged`.
2. **Active Window Focus Change:** Triggered via `workspace.windowActivated` to update directional focus constraints, active Niri scrollable column centering, and promotion checks.
3. **Interactive User Drag & Resize:** While a window is being dragged or resized (`isInteractiveMoveResize`), Direktor pauses automatic retiling (`_direktorResizing = true`). Once the mouse is released (`interactiveMoveResizeFinished`), Direktor captures the new split ratios and retiles the monitor once.
4. **Layout or Split Direction Toggling:** Triggered on demand via shortcuts (`Meta+Space`, `toggleSplitDirection`).
5. **Monitor Hotplug / Virtual Desktop Switch:** Triggered when `workspace.screensChanged` or `workspace.currentDesktopChanged` fires.
6. **Hot-Reload:** Triggered when `Meta+Shift+R` is pressed or System Settings changes (`options.configChanged`).

---

## 3. D-Bus Actions & Custom Shortcuts Guide

Because KWin scripts run in a sandboxed JavaScript environment, dynamic user-defined shortcuts and external bindings communicate with Direktor via our **D-Bus Bridge (`org.kde.kwin.direktor`)** using `triggerAction(actionName, arg)`.

### A. Supported Actions Matrix

| Action Identifier | Description | Default Shortcut |
| :--- | :--- | :--- |
| `toggle_floating` | Toggles active window between Tiled and Floating (with optimal sizing/centering) | `Meta+Shift+F` |
| `cycle_layout` | Cycles to the next available layout engine on the current monitor | `Meta+Space` |
| `promote_master` | Promotes the active window to the Master position (`children[0]`) | `Meta+Return` |
| `reload_config` | Triggers a supercharged differential hot-reload of all configurations & rules | `Meta+Shift+R` |
| `dump_logs` | Dumps the in-memory ring buffer directly to `~/.config/direktor/log.txt` | D-Bus CLI (`dump_logs`) |
| `focus_left` / `right` / `up` / `down` | Directional focus across windows (with strict monitor boundary check & tie-breaking) | `Meta+H/J/K/L` or Arrow keys |
| `move_left` / `right` / `up` / `down` | Swaps or moves the active window with its neighbor in the given direction | `Meta+Shift+H/J/K/L` |
| `set_layout <id>` | Switches directly to layout: `dwindle`, `niri-scrollable`, `master-stack`, or `floating` | D-Bus argument (`set_layout dwindle`) |
| `set_padding <px>` | Adjusts global padding live across all monitors | D-Bus argument (`set_padding 16`) |

### B. How to Set Up Custom Shortcuts
1. **Via System Settings (UI):**
   Open **System Settings > Keyboard > Shortcuts > KWin**. Look for actions prefixed with `Direktor: <Shortcut Name>` (`e.g., Direktor: Hot-Reload Configuration`, `Direktor: Toggle Active Window Floating State`) and assign your preferred key combinations.
2. **Via Custom Bindings (`config.ui` / `main.xml`):**
   In **System Settings > KWin Scripts > Direktor > Configure > Custom Shortcuts**, enter custom actions (one per line):
   ```text
   # bind = Shortcut Name, Action, Displayed Notification
   bind = Toggle Float, toggle_floating, "Toggled Floating State"
   bind = Cycle Layout, cycle_layout, "Switched Layout"
   bind = Set Layout Dwindle, set_layout dwindle, "Dwindle Layout"
   ```
3. **Via Shell / CLI (`qdbus6` / `qdbus`):**
   You can bind any shell script, sxhkd, or custom KDE shortcut directly to a D-Bus call:
   ```bash
   qdbus6 org.kde.KWin /Direktor org.kde.Direktor.triggerAction "toggle_floating" ""
   qdbus6 org.kde.KWin /Direktor org.kde.Direktor.triggerAction "dump_logs" ""
   qdbus6 org.kde.KWin /Direktor org.kde.Direktor.triggerAction "set_layout" "dwindle"
   ```

---

## 4. Limitations, Quirks & Sandboxing Notes

1. **KWin JavaScript Sandboxing (No direct filesystem write access):**
   * Pure KWin `.js` scripts cannot call `File.write()` or `fs.writeFileSync()` arbitrarily.
   * *Our Workaround:* Direktor reads external JSON files via `XMLHttpRequest (GET)` and writes log snapshots or configuration updates via `XMLHttpRequest (PUT)` to local paths like `file:///home/tcone/.config/direktor/log.txt` and `KWin.writeConfig()`.
2. **Wayland Coordinate Isolation vs. X11:**
   * In Wayland, windows do not know their absolute global screen coordinates. Moving or resizing windows across multiple monitors must respect exact monitor boundaries (`clientArea(0, screen, desktop)`).
   * *Our Workaround:* `TileUtils.assignWindowRect` enforces strict geometry clipping so windows never spill over borders or overlap improperly on multi-monitor setups.
3. **Session Restarts Logout Wayland Sessions:**
   * Restarting KWin (`kwin_wayland`) terminates the user session and closes all applications.
   * *Our Workaround:* We built the **Supercharged Differential Hot-Reload (`Meta+Shift+R`)** to update, untile, and retile open windows dynamically inside the running process without ever restarting KWin.
4. **Terminal / Ghostty Minimum Character Size Constraints:**
   * Some terminals (`like Ghostty`) enforce a hard minimum grid size (e.g., cannot shrink smaller than 10x10 characters). If you open 20 terminal instances on a single small screen, KWin may allow slight overlap because the app refuses to shrink below its minimum size hint.
   * *Our Workaround:* Direktor caps grid generation constraints and gracefully allows vertical stacking (like in our Niri Column logic) to prevent KWin from violently rejecting window geometry assignments.

### C. Recent KWin Discoveries & Workarounds
1. **The "Baby Window" / Zombie Listener Race Condition:**
   * *The Quirk:* When KWin creates a notification or OSD (like volume changes), it briefly spawns a completely blank Wayland window in memory before assigning it the `plasmashell` or notification identity.
   * *The Problem:* Tiling scripts might mistakenly identify this blank millisecond-old window as a normal application and attach event listeners to it. When the notification fades out and dies, KWin clears the text, waking up those zombie listeners and causing massive infinite retile loops.
   * *Our Workaround:* Direktor strictly tracks the lifecycle of every window inside an internal `registry`. Event listeners (`checkReEvaluate`) are hard-coded to verify a window's registry existence before processing any changes, instantly killing zombie events for dying windows.
2. **Wayland App Launch Geometry Negotiation:**
   * *The Quirk:* Apps (especially Flatpaks, GTK4, and Zen Browser) aggressively negotiate their initial launch size with the Wayland compositor. If a script forcefully snaps them into a tile at millisecond zero, the app will panic and override the tiling size, rendering the window at the wrong dimensions.
   * *Our Workaround:* Direktor employs a mandatory **20ms launch delay** (`handleWindowAdded`). It allows KWin to natively map the window (usually in the center of the screen) and finish its Wayland negotiation, and *then* Direktor snaps it into the grid.
3. **No Hardware Animations in JavaScript:**
   * *The Quirk:* KWin Plasma 6 completely isolates JavaScript scripts from the hardware-accelerated VSync animation pipeline. We cannot write smooth JS window morphing algorithms without causing tearing and desyncs.
   * *Our Workaround:* We leverage native KWin C++ Desktop Effects (like `kwin4_effect_geometry_change`). By intentionally delaying the window launch, Direktor allows the native C++ effect to handle the smooth, 60fps morphing animation from the center of the screen into the tile grid.

---

## 5. Customization & Configuration Pathways

Direktor offers three tiers of customization depending on user workflow:

1. **GUI Configuration (System Settings > KWin Scripts > Direktor > Configure):**
   * **General:** Default layout, global padding (`px`), animation duration (`ms`), resize steps (`px`), and ignore lists (by window class or title).
   * **Dwindle Layout & Gaps:** Live 3-window preview and 6 independent outer/inner gap controls.
   * **Custom Shortcuts:** Define string action bindings.
   * **Logs & Diagnostics:** Scrollable real-time ring buffer viewer and file links.
2. **External JSON Rules Matrix (`~/.config/direktor/rules.json`):**
   Modify `rules.json` directly to define regex window matches, auto-floating rules, and monitor-specific layout overrides:
   ```json
   {
     "version": "1.0",
     "general": { "defaultLayout": "dwindle", "padding": 8 },
     "monitors": { "DP-1": { "layout": "niri-scrollable" } },
     "rules": [
       { "match": { "resourceClass": "org.kde.spectacle" }, "action": "float" },
       { "match": { "dialog": true }, "action": "float" },
       { "match": { "resourceClass": "krunner" }, "action": "ignore" }
     ]
   }
   ```
3. **Custom Layout Scripts (`~/.config/direktor/layouts/`):**
   Drop custom layout modules inside the external layouts folder to extend Direktor with user-created algorithms.

---

## 6. Future Development Roadmap (Phase 3 & Beyond)

As Direktor stabilizes, development is shifting towards advanced isolation, efficiency, and aesthetics:

1. **Native KDE Plasmoid Widget:**
   * Development of a dedicated Plasma Widget (Panel Icon / System Tray).
   * Will provide a beautiful visual GUI for selecting layouts, tweaking padding, toggling windows, and viewing health stats without ever touching a JSON file or shortcut.
2. **True Per-Desktop & Per-Monitor Isolation:**
   * Transitioning the Layout Manager memory to use a composite key (`MonitorName_DesktopID`).
   * This will guarantee that every single virtual desktop across every single monitor maintains its own independent, persistent layout state.
3. **True Niri Column Panning:**
   * Evolving the `niri-scrollable` layout from a static column packer into a true infinite horizontal canvas. Excess windows will be pushed literally off-screen, and users will use `Meta+Arrow` shortcuts to smoothly pan the viewport left and right.
4. **Targeted Retiling Optimization:**
   * Re-writing the retile execution loop to drastically reduce CPU overhead. Instead of recalculating every monitor, Direktor will surgically retile only the specific virtual desktop that suffered a window change.
5. **Delayed Morphing Launch:**
   * Increasing the 20ms launch delay up to ~80ms to perfectly sync Direktor's grid-snapping with KDE's native `kwin4_effect_geometry_change` desktop effect, resulting in a beautiful, hardware-accelerated morphing animation when apps open.