# Direktor: Development Roadmap & TODO List

## ✅ Phase 1: OSD & Notification Companion (`direktor-osd`) — COMPLETED
- [x] **Solve Wayland Sandbox OSD Restrictions**: Implemented `direktor-osd` user-session companion daemon (`bin/direktor-osd`) to bridge KWin OSD events (`[INFO] [OSD]`) directly to Plasma session services.
- [x] **Dual Notification Delivery**:
  - **Native Plasma OSD Pill (`Option 4`)**: Triggers `/org/kde/osdService` (`showText`) over D-Bus.
  - **System Notification Toast (`Option 2`)**: Triggers `notify-send` with `preferences-system-windows` icon.
- [x] **Automated Lifecycle & Zero Overhead**:
  - Integrated `direktor-osd` installation and systemd unit registration (`direktor-osd.service`) right into `./package.sh --install`, `--upgrade`, and `--live-reload`.
  - Added clean uninstallation via `./package.sh --uninstall`.
  - Confirmed 0.0% CPU and zero activity when `Direktor` KWin script is disabled in Plasma settings.

---

## ✅ Phase 2: Advanced Logging, Watchdog & Layout Debugging — COMPLETED

### 1. Continuous File Logging & Log Rotation
- [x] **Real-Time Log Capture**: Extend `direktor-osd` to filter and capture all `[Direktor]` log lines (`INFO`, `WARN`, `ERROR`, QML diagnostics) from the `plasma-kwin_wayland` stream.
- [x] **Persistent Log File**: Automatically write filtered log entries to `~/.config/direktor/direktor.log`.
- [x] **Automated Rotation**: Implement log size thresholds (`e.g., 5 MB limit`) to archive and rotate logs (`direktor.log.1`), preventing unbounded disk growth while maintaining complete history.

### 2. Instant OSD & Critical Toast Alerts on Errors/Crashes
- [x] **Exception & Error Monitoring**: Configure `direktor-osd` to watch for KWin script crashes, QML errors (`Component failed to load`, `TypeError`, `ReferenceError`), or explicit `[ERROR]` entries from `Direktor`.
- [x] **High-Priority Visual Alerting**:
  - Pop up a critical desktop notification (`dialog-error` icon): `"⚠️ Direktor Error / Crash Detected: <Error Summary>"`.
  - Display an instant OSD pill warning on screen.
- [x] **Crash Archiving**: Automatically extract exact error stack traces and recent ring-buffer context into `~/.config/direktor/crashes.log` for immediate debugging.

### 3. Liveness Watchdog & Self-Diagnosis
- [x] **Script Liveness Monitoring**: Detect if KWin forcefully unloads or crashes `org.kde.kwin.direktor` (`e.g., after Wayland compositor resets or display reconnects`).
- [x] **User Alert & Self-Healing**: Immediately notify the user via OSD/Toast when a stoppage occurs, with an optional auto-recovery trigger (`via D-Bus unloadScript/loadDeclarativeScript/start`) to restore tiling seamlessly.
- [x] **Health & Export Shortcut (`Meta+Shift+D`)**: Implement a dedicated shortcut and D-Bus action to dump in-memory diagnostic state and display a live health summary (`"Direktor Health: Active | X Windows Tiled | 0 Errors Logged"`).

### 4. Debug: Window Retiling Behavior After Layout Switch
- [ ] **Inspect & Trace Layout Transitions**: Investigate window geometry calculation and tile assignment right when `Meta+Space` (`or D-Bus cycle_layout`) switches the active monitor layout.
- [ ] **Verify Smooth Positioning**: Ensure windows retile instantaneously without overlap, stale positioning, or skipped frames across multiple screen outputs and virtual desktops.

### 5. Debug: Floating All Layout Behavior
- [ ] **Diagnose "All Floating" Layout Issues**: Trace why windows in `All Floating` layout were previously observed sizing down and stacking directly on top of one another ("glued" in place where mouse dragging/moving failed).
- [ ] **Fix Floating Window Rules & Geometry**: Ensure `All Floating` layout cleanly releases window movement constraints (`and/or restores previous normal window geometry before tiling`), allowing free dragging and resizing anywhere on the screen without snapback.

### 6. Debug: Gaps and Padding Regressions
- [x] **Virtual Desktop Padding Loss**: Fixed. (Issue where padding dropped to zero across virtual desktops has been resolved).
- [x] **Dwindle Layout 3rd Window Gap Loss**: Fixed. (Caused by Dwindle isolating specific padding keys from the global `padding` variable without syncing).
- [x] **General Gap Instability**: Fixed. (Hot-reloading suffered from a caching bug where KWin's global `options` object ignored `kwinrc` changes. KSharedConfig now properly drops disk cache on reload).

---

## ✅ Phase 3: Direktor Tray Applet (`direktor_gui`) — COMPLETED
- [x] **Native QML Integration**: Built a native PyQt6 applet using `PlasmaComponents3` and `Kirigami` to automatically inherit the user's Klassy/Darkly window decorations, Material You colors, and system transparency.
- [x] **Real-Time Layout Controls**: Implemented a dashboard connecting UI buttons directly to KWin's layout cycle/floating toggle via `qdbus-qt6` KGlobalAccel shortcuts.
- [x] **Advanced Gap Management**:
  - Implemented `Uniform Gaps` (Type 2) vs `Custom Directional Gaps` (Type 1) toggles.
  - Mirrored all new UI options directly into KWin's native System Settings XML schemas (`config.ui`, `main.xml`).
- [x] **Debounced Live Config Injection**: Built a `QTimer` wrapper that instantly saves UI slider changes to `kwinrc` while debouncing the heavy `qdbus-qt6 org.kde.KWin /KWin reconfigure` signal by 300ms, preventing KWin stuttering during live dragging.

---

## 📅 Phase 7: Post-Release Features & Bug Fixes
- [ ] **Advanced Padding Setup**:
  - **User-Defined Gaps**: Build out advanced UI workflows for granular user-defined gap presets.
  - **Per-Layout Gaps**: Implement layout-specific gap memory (e.g., Dwindle gets 10px padding, while Niri Columns gets 0px padding) so padding dynamically switches when the active layout changes.
  - **Auto-Calculated Smart Gaps**: Auto-calculate and suggest the proper padding/gap size based on window screen, system scale, and other factors that might make apps blurry or uncommonly sized and cause issues.
- [x] **Window Shifting Bug**: Fixed. (Keyboard shortcuts for shifting windows now successfully swap tile positions).
