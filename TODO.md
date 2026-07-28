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
- [x] **Inspect & Trace Layout Transitions**: Fixed. Windows retile instantaneously across virtual desktops.
- [x] **Verify Smooth Positioning**: Fixed.

### 5. Debug: Floating All Layout Behavior
- [ ] **Diagnose "All Floating" Layout Issues**: Trace why windows in `All Floating` layout were previously observed sizing down and stacking directly on top of one another ("glued" in place where mouse dragging/moving failed).
- [ ] **Fix Floating Window Rules & Geometry**: Ensure `All Floating` layout cleanly releases window movement constraints (`and/or restores previous normal window geometry before tiling`), allowing free dragging and resizing anywhere on the screen without snapback.

### 6. Debug: Gaps and Padding Regressions
- [x] **Virtual Desktop Padding Loss**: Fixed. 
- [x] **Dwindle Layout 3rd Window Gap Loss**: Fixed. 
- [x] **General Gap Instability**: Fixed. 
- [x] **Window Shifting Bug**: Fixed.

---

## ✅ Phase 3: Direktor Tray Applet Core UI (`direktor_gui`) — COMPLETED
- [x] **Native QML Integration**: Built a native PyQt6 applet using `PlasmaComponents3` and `Kirigami`.
- [x] **Real-Time Layout Controls**: Implemented a dashboard connecting UI buttons directly to KGlobalAccel shortcuts.
- [x] **Advanced Gap Management**: Built Uniform vs Custom Gap modes with instant `kwinrc` syncing.
- [x] **Debounced Live Config Injection**: Built a `QTimer` wrapper preventing KWin stuttering during live slider dragging.

---

## ✅ Phase 4: System Optimizer & Diagnostics — COMPLETED
- [x] **Plasma Diagnostics Engine**: Built a Python background scanner that dynamically queries `kdeglobals` and `kwinrc` to detect conflicting native KWin effects.
- [x] **Intelligent UI Feedback**: Designed a 3-tier semantic feedback system (Optimized, Questionable, Conflicting) with Kirigami theme colors.
- [x] **Contextual Help**: Added native Kirigami tooltips explaining exactly why certain effects (Magic Lamp, Scale, Slow animations) break Wayland tiling.
- [x] **Auto-Fix DBus Integration**: Implemented dedicated Python slots to dynamically rewrite config values and hot-reload KWin directly from the applet.

---

## ✅ Phase 5: GitHub Release & Documentation — COMPLETED
- [x] **Repository Generation**: Initialized Git repository, configured `.gitignore`, and tracked all core scripts.
- [x] **Project Branding**: Generated and integrated a custom ultra-modern neon banner.
- [x] **Comprehensive README**: Wrote a heavily detailed `README.md` covering architecture, installation, the Python OSD daemon, and exact daily-driver shortcuts.

---

## 📅 Phase 6: Post-Release Features — PLANNED
- [ ] **Aesthetics & Borders**:
  - **Rounded Corners & Window Borders**: Bring native, customizable aesthetic tiling borders directly into Plasma 6.
- [ ] **Advanced Layout State**:
  - **Per-Screen Layouts**: Independent layout memory for multi-monitor setups (e.g., Dwindle on ultrawide, Columns on laptop).
  - **Per-Virtual Desktop Layouts**: Isolate entirely unique tiling engines and rules on a per-desktop basis.
- [ ] **Advanced Padding Setup**:
  - **User-Defined Gaps**: Build out advanced UI workflows for granular user-defined gap presets.
  - **Per-Layout Gaps**: Implement layout-specific gap memory (e.g., Dwindle gets 10px padding, while Niri Columns gets 0px padding).
  - **Auto-Calculated Smart Gaps**: Auto-calculate and suggest the mathematically perfect gap size based on screen resolution and UI scaling.

---

## 🐞 Phase 7: Edge-Case Bug Squashing — PLANNED
- [ ] **Flatpak Geometry Strictness**: Ensure the new 35px Geometry Watchdog perfectly snaps GTK apps under all scaling configurations.
- [ ] **Floating Layout Constraints**: Fix the "glued window" behavior described in Phase 2 for the 'All Floating' engine.
