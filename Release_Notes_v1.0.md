# Direktor v1.0.0 Release Notes

We are thrilled to announce the v1.0.0 stable release of **Direktor**, the Wayland-First Tiling Manager for Plasma 6. 

This release marks the transition from our beta phase into a highly stable, production-ready tiling engine. During this final stretch, we conducted intensive acceptance testing and undertook a major architectural cleanup to resolve long-standing state desyncs, edge-case bugs with fullscreen games, and Wayland-specific layout quirks.

Here is a comprehensive breakdown of the critical issues we detected and exactly how we resolved them in this release:

### 1. The Watchdog Ejection Bug (Issue #2)
**Detected Issue:** When launching heavy fullscreen applications (like Proton games or the Hydra launcher), Wayland initialization delays caused the engine's Geometry Watchdog to falsely flag the app as "stubborn" and forcibly eject it into a broken floating state. Furthermore, normal apps with rigid minimum sizes (like Dolphin) were also being forcefully ejected from the tile grid when they refused to shrink.
**Resolution:** The watchdog has been made substantially more intelligent. 
* We implemented a strict **1.5-second grace period** that explicitly protects windows transitioning in and out of fullscreen mode from being harassed by the watchdog. 
* We completely removed the aggressive "Auto-fallback to FLOATING" behavior. If an app hits a hard Wayland minimum-size limit, Direktor will now gracefully allow it to overlap its neighbors within the tile grid rather than destroying the layout by ejecting it.

### 2. Floating Snapback & Rubber-banding
**Detected Issue:** When using the "All Floating" layout, or when dragging individually floated windows, releasing the mouse would cause the window to aggressively snap back to its previous tiled position.
**Resolution:** Hardened the `interactiveMoveResizeFinished` KWin listeners. The engine now instantly aborts all snap-back and retiling logic if the active engine is set to "floating" or if the target window is individually floated, allowing for completely unconstrained drag-and-drop freedom.

### 3. Niri Layout Horizontal Overlap
**Detected Issue:** In the infinitely scrollable `niri-scrollable` layout, apps with rigid minimum widths were visually bleeding out of their columns and overlapping the adjacent windows because column widths were strictly percentage-based.
**Resolution:** The Niri layout engine now dynamically queries KWin for each window's exact `minSize.width`. If an app requires more space than the default column provides, the engine automatically widens that specific column on the fly to perfectly accommodate it, completely eliminating horizontal overlap.

### 4. KWin Script vs. Tray Applet Desyncs
**Detected Issue:** The Python Tray Applet and the KWin JavaScript engine were maintaining separate, conflicting internal states. This led to broken pause functionality and missing layout configurations. Furthermore, the Tray Applet was passing informal shorthand names (like `columns`) instead of the canonical backend layout IDs (like `niri-scrollable`), which silently broke layout switching.
**Resolution:** We established a strict **Single Source of Truth**. 
* The Tray Applet no longer holds state; it acts purely as a stateless remote control that reads/writes directly to the KWin `kcfg` configuration backend via D-Bus.
* We canonicalized all layout IDs across the codebase and implemented a human-readable ListModel for the Tray UI.
* We added full UI parity to the Tray Applet, exposing the advanced Geometry Watchdog and Cascade Offset controls so they match the System Settings KCM exactly.

### 5. Hot-Path Performance Degradation
**Detected Issue:** The `RuleEngine` was spamming the system journal with debug logs on every single window evaluation. Worse, it was triggering expensive configuration reloads from disk directly on the hot-path, severely degrading compositor performance during heavy window activity.
**Resolution:** All verbose development scaffolding has been permanently removed. The configuration reload logic (`reloadFromKWin`) has been safely restricted to only fire in response to explicit `configChanged` D-Bus events, ensuring the layout engine runs blazingly fast without blocking KWin.

---

**Additional Polish & Hygiene:**
* Re-wrote the OSD regex parsers to be future-proof (removing hardcoded years).
* Cleaned up thousands of lines of dead code and formatting bloat.
* Hardened the uninstall scripts to cleanly remove all D-Bus services and autostart files.
