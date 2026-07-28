<div align="center">
  <img src="assets/banner.png" alt="Direktor Banner" width="100%">
  <br>
  <br>

  [![KDE Plasma 6](https://img.shields.io/badge/KDE_Plasma-6.0+-blue?logo=kde&style=flat-square)](#)
  [![Wayland First](https://img.shields.io/badge/Wayland-First-brightgreen?logo=wayland&style=flat-square)](#)
  [![License: GPL-3.0](https://img.shields.io/badge/License-GPL_3.0-purple?style=flat-square)](#)

  **An ultra-modern, zero-bloat, Wayland-First Tiling Window Manager for KDE Plasma 6.**
</div>

---

## ⚡ Why Direktor?

Traditional tiling managers on KDE often fight the compositor, resulting in sluggish animations, broken geometry, and a rigid experience. 

**Direktor** is completely different. By decoupling the architecture into a hyper-lightweight KWin Javascript engine and a background Python companion daemon, Direktor provides a "buttery smooth" tiling experience that perfectly integrates with Plasma 6's native effects, animations, and Wayland architecture.

## 🚀 Features

- **Wayland Native & Plasma Integrated**: Hooks directly into KWin's native `geometrychange` effects. Windows slide, scale, and morph into their tiles flawlessly without the jumpiness of X11 tiling managers.
- **Dynamic 3-Tier Gap Engine**: Forget editing messy text files. Swap between Unified padding, Simple inner/outer gaps, and Custom directional gaps on the fly.
- **Native QML Tray Applet**: Includes a gorgeous, Kirigami-built Tray Applet that allows you to hot-reload configs, cycle layouts, and toggle floating windows instantly.
- **Plasma System Optimizer**: A built-in diagnostic tool in the Tray Applet that actively scans your `kwinrc` and `kdeglobals` to detect and Auto-Fix conflicting Plasma desktop effects (like Magic Lamp and slow animation scaling).
- **Direktor-OSD Companion**: A 0.0% CPU background daemon that intercepts KWin logs, throws instant crash alerts, natively routes OSD (On-Screen Display) pills, and acts as a Liveness Watchdog to auto-revive tiling if Wayland resets.
- **Smart Flatpak Tolerance**: Built-in 35px Geometry Watchdogs to force stubborn GTK Flatpaks into exact pixel-perfect tiles despite Wayland Client-Side Decoration (CSD) quirks.

---

## ⚙️ Suggested Setup

For the absolute best, most fluid experience, we highly recommend the following native Plasma settings (which can be auto-applied via the Tray Applet's System Optimizer):

- **Global Animation Speed**: `0.5x` (Prevents layout stuttering)
- **Geometry Change Effect**: `Enabled` (Crucial for smooth tile resizing)
- **Magic Lamp / Scale / Squash**: `Disabled` (These intercept window geometry and break the illusion of seamless tiling)

---

## 🛠️ Installation

Direktor ships with a zero-friction packaging script that automatically compiles the KWin package, installs the Python OSD daemon, and registers the Tray Applet to your autostart.

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/direktor.git
cd direktor
```

2. **Run the Packager:**
```bash
./package.sh --install
```

*(To apply updates later, simply pull the latest code and run `./package.sh --live-reload` to hot-patch the running KWin session!)*

## 🎮 Usage

Direktor relies on KGlobalAccel for lightning-fast shortcuts. Here is the recommended configuration (matching the developer's exact daily-driver setup):

**Direktor Tiling Shortcuts:**
- **Cycle Layout Engine**: `Meta + /` (Swap between Dwindle, Columns, etc.)
- **Toggle Floating**: `Meta + F` (Float/Unfloat the active window)
- **Focus Windows**: `Meta + Arrow Keys` (Move focus across tiles)
- **Move / Swap Windows**: `Meta + Shift + Arrow Keys` (Shift tiles physically around)
- **Resize Windows**: `Meta + Ctrl + Arrow Keys` (Expand or shrink tile width and height)
- **Toggle Dwindle Split**: `Meta + J` (Swap between horizontal/vertical splits)
- **Toggle Desktop Isolation**: `Meta + \` (Enable/Disable per-desktop layouts)
- **Hot-Reload Config**: `Meta + Shift + R` (Instantly reload all settings and UI configs)

**Suggested KWin Native Shortcuts (Plasma Settings -> Shortcuts -> KWin):**
- **Window to Next Screen**: `Meta + Shift + Right`
- **Window to Previous Screen**: `Meta + Shift + Left`
- **Switch to Desktop 1-4**: `Meta + 1-4`
- **Window to Desktop 1-4**: `Meta + Shift + 1-4`

*Want to change the gaps or system settings? Just click the Direktor icon in your system tray!*

## 🗺️ Roadmap & Documentation

Curious about what we're building next or how the underlying Watchdog works?
Check out our [Development Roadmap & TODO (Phase 1-7)](TODO.md).

### 🔮 Upcoming Features
- **Per-Layout Gap Memory**: Direktor will soon remember layout-specific padding (e.g., Dwindle gets 10px gaps, but Niri Columns automatically switches to 0px gaps).
- **Auto-Calculated Smart Gaps**: An engine that dynamically calculates and suggests the mathematically perfect gap size based on your screen resolution and scaling factor.
- **Advanced User-Defined Gaps**: Build out granular custom presets beyond the standard 3-tier gap system.

## 🗑️ Uninstallation

If you decide to return to a vanilla Plasma experience, Direktor leaves zero trace behind:
```bash
./package.sh --uninstall
```

---

## 📖 Project Backstory & Disclaimer

**Direktor** is an independent, free, and open-source project born out of pure passion, specific workflow needs, and sheer interest in Wayland and KWin scripting. 

Please note:
- **Independent Effort**: This is an individual pastime/hobby project and is in no way officially associated with, endorsed by, or affiliated with the KDE project.
- **AI-Assisted**: Artificial Intelligence was heavily utilized as a pair-programming partner to help design the architecture, write the codebase, and generate the documentation.
- **Free License**: The entirety of this project is provided under a fully free and open-source license. Feel free to fork, modify, and build upon it!

---

<div align="center">
  <i>Built with ❤️ for the KDE Plasma community.</i>
</div>
