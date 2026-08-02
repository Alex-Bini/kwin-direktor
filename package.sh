#!/usr/bin/env bash
set -e

echo "[Direktor Packager] Building distributable KWin Plasma 6 script package..."

BUILD_DIR="build_package"
OUTPUT_FILE="direktor.kwinscript"

# Clean previous build artifacts
rm -rf "$BUILD_DIR" "$OUTPUT_FILE"
mkdir -p "$BUILD_DIR/contents/code" "$BUILD_DIR/contents/ui" "$BUILD_DIR/contents/config"

# Copy package manifest, config XML, and settings UI
cp package/metadata.json "$BUILD_DIR/"
cp package/contents/config/main.xml "$BUILD_DIR/contents/config/"
cp package/contents/ui/* "$BUILD_DIR/contents/ui/"

# Bundle source modules for QML declarative entrypoint
BUNDLE="$BUILD_DIR/contents/code/engine.js"
echo "// Direktor KWin Plasma 6 Script Bundle ($(date '+%Y-%m-%d %H:%M:%S'))" > "$BUNDLE"
cat << 'EOF' >> "$BUNDLE"
var workspace = typeof Workspace !== "undefined" ? Workspace : (typeof globalThis !== "undefined" && globalThis.workspace ? globalThis.workspace : null);
var Workspace = typeof Workspace !== "undefined" ? Workspace : (typeof globalThis !== "undefined" && globalThis.Workspace ? globalThis.Workspace : null);
var KWin = typeof KWin !== "undefined" ? KWin : (typeof globalThis !== "undefined" && globalThis.KWin ? globalThis.KWin : null);
var registerShortcut = typeof globalThis !== "undefined" && globalThis.registerShortcut ? globalThis.registerShortcut : function() {};
var registerScreenEdge = typeof globalThis !== "undefined" && globalThis.registerScreenEdge ? globalThis.registerScreenEdge : function() {};
var assert = typeof globalThis !== "undefined" && globalThis.assert ? globalThis.assert : function(cond, msg) { if (!cond) throw new Error(msg || "Assertion failed"); };
var options = typeof globalThis !== "undefined" && globalThis.options ? globalThis.options : {};
var print = typeof console !== "undefined" && typeof console.warn === "function" ? function(msg) { console.warn(msg); } : (typeof print === "function" ? print : function() {});
if (typeof globalThis !== "undefined") globalThis.print = print;
EOF

for file in \
    src/core/Logger.js \
    src/core/TileUtils.js \
    src/core/WindowRegistry.js \
    src/core/DirectionalEngine.js \
    src/layouts/LayoutEngine.js \
    src/layouts/DwindleLayout.js \
    src/layouts/ScrollableNiriLayout.js \
    src/layouts/FloatingLayout.js \
    src/layouts/MasterStackLayout.js \
    src/layouts/LayoutManager.js \
    src/config/ConfigManager.js \
    src/config/WindowRuleEngine.js \
    src/ipc/DBusBridge.js \
    src/main.js; do
    echo "" >> "$BUNDLE"
    echo "// --- Module: $file ---" >> "$BUNDLE"
    sed -e '/^import /d' -e 's/^export class /class /g' -e 's/^export const /const /g' -e 's/^export function /function /g' "$file" >> "$BUNDLE"
done

# Create non-QML standalone fallback (main.js)
sed '/^\.pragma library/d' "$BUNDLE" > "$BUILD_DIR/contents/code/main.js"
echo "" >> "$BUILD_DIR/contents/code/main.js"
echo "// Auto-start standalone engine if loaded without QML declarative loader" >> "$BUILD_DIR/contents/code/main.js"
echo "if (typeof startDirektor === 'function' && typeof _direktorEngine === 'undefined') startDirektor({});" >> "$BUILD_DIR/contents/code/main.js"

# Create the .kwinscript archive (zip archive containing metadata.json at root)
cd "$BUILD_DIR"
zip -r "../$OUTPUT_FILE" metadata.json contents/ > /dev/null
cd ..

rm -rf "$BUILD_DIR"

# Ensure external configuration directory exists
CONF_DIR="$HOME/.config/direktor"
mkdir -p "$CONF_DIR/layouts"

if [ ! -f "$CONF_DIR/rules.json" ]; then
    echo "[Direktor Packager] Initializing external rules.json in $CONF_DIR..."
    cat << 'EOF' > "$CONF_DIR/rules.json"
{
    "version": "1.0",
    "general": {
        "defaultLayout": "dwindle",
        "padding": 8,
        "animationDuration": 300
    },
    "rulesConfig": {
        "useRegexOverrides": true,
        "ignoreClasses": "kscreenlocker,sddm,greeter,lockscreen,krunner,yakuake,spectacle,plasmashell,ksmserver,kded5,org.kde.kscreenlocker_greet,org.kde.plasmashell,kcalc,pavucontrol,org.kde.polkit-kde-authentication-agent-1,org.kde.kdialog,org.kde.direktor.tray",
        "ignoreTitles": "Desktop — Plasma,Desktop,Screen Locker,Login Screen,Greeter,Open File,Save File,Preferences,Settings,Authentication"
    }
}
EOF
fi

if [ ! -f "$CONF_DIR/rulesrc" ]; then
    echo "[Direktor Packager] Initializing external rulesrc KConfig file in $CONF_DIR..."
    cat << 'EOF' > "$CONF_DIR/rulesrc"
[Rules]
ignoreClasses=kscreenlocker,sddm,greeter,lockscreen,krunner,yakuake,spectacle,plasmashell,ksmserver,kded5,org.kde.kscreenlocker_greet,org.kde.plasmashell,kcalc,pavucontrol,org.kde.polkit-kde-authentication-agent-1,org.kde.kdialog,org.kde.direktor.tray
ignoreTitles=Desktop — Plasma,Desktop,Screen Locker,Login Screen,Greeter,Open File,Save File,Preferences,Settings,Authentication
EOF
fi

echo "[Direktor Packager] Successfully generated: $OUTPUT_FILE"
echo "[Direktor Packager] External config directory verified: $CONF_DIR"
echo "To install via CLI:"
echo "  kpackagetool6 --type KWin/Script --install $OUTPUT_FILE"
echo "To upgrade an existing install:"
echo "  kpackagetool6 --type KWin/Script --upgrade $OUTPUT_FILE"

if [ "$1" = "--uninstall" ]; then
    echo "[Direktor Packager] Uninstalling Direktor KWin script and companion service..."
    kpackagetool6 --type KWin/Script --remove org.kde.kwin.direktor 2>/dev/null || true
    qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "org.kde.kwin.direktor" 2>/dev/null || true
    systemctl --user stop direktor-osd.service 2>/dev/null || true
    systemctl --user disable direktor-osd.service 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/direktor-osd.service" "$HOME/.local/bin/direktor-osd"
    rm -f "$HOME/.config/autostart/direktor-tray.desktop"
    systemctl --user daemon-reload 2>/dev/null || true
    echo "[Direktor Packager] Uninstalled successfully."
    exit 0
fi

if [ "$1" = "--install" ] || [ "$1" = "--live-reload" ] || [ "$1" = "-r" ] || [ "$1" = "-i" ] || [ "$1" = "--upgrade" ] || [ "$1" = "-u" ]; then
    echo "[Direktor Packager] Installing companion Tray Applet autostart..."
    mkdir -p ~/.config/autostart
    cat <<EOF > ~/.config/autostart/direktor-tray.desktop
[Desktop Entry]
Type=Application
Exec=bash -c "mkdir -p ~/.config/direktor && /usr/bin/python3 $(pwd)/src/ui/direktor_gui.py >> ~/.config/direktor/direktor-tray.log 2>&1"
Hidden=false
NoDisplay=false
Terminal=false
X-GNOME-Autostart-enabled=true
Name=Direktor Tray Applet
Comment=KWin Tiling Layout and Gaps Controller
Icon=preferences-system-windows
EOF

    echo "[Direktor Packager] Installing/Upgrading companion service 'direktor-osd'..."
    mkdir -p "$HOME/.local/bin" "$HOME/.config/systemd/user"
    cp bin/direktor-osd "$HOME/.local/bin/direktor-osd"
    chmod +x "$HOME/.local/bin/direktor-osd"
    cp systemd/direktor-osd.service "$HOME/.config/systemd/user/direktor-osd.service"
    systemctl --user daemon-reload
    systemctl --user enable --now direktor-osd.service 2>/dev/null || true
    systemctl --user restart direktor-osd.service 2>/dev/null || true

    echo "[Direktor Packager] Launching Tray Applet..."
    if ! pgrep -f "direktor_gui.py" > /dev/null; then
        nohup bash -c "mkdir -p ~/.config/direktor && /usr/bin/python3 $(pwd)/src/ui/direktor_gui.py >> ~/.config/direktor/direktor-tray.log 2>&1" >/dev/null 2>&1 &
    fi

    echo "[Direktor Packager] Upgrading installed package via kpackagetool6..."
    kpackagetool6 --type KWin/Script --upgrade "$OUTPUT_FILE" 2>/dev/null || kpackagetool6 --type KWin/Script --install "$OUTPUT_FILE"
    if [ "$1" = "--live-reload" ] || [ "$1" = "-r" ]; then
        echo "[Direktor Packager] Live-rebooting KWin script 'org.kde.kwin.direktor' via D-Bus..."
        # AGGRESSIVELY clear QML Cache to prevent executing stale ghost bytecode
        rm -rf "$HOME/.cache/kwin/qmlcache"/* 2>/dev/null || true
        
        qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "org.kde.kwin.direktor.dev2" 2>/dev/null || true
        qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "org.kde.kwin.direktor.dev3" 2>/dev/null || true
        qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "org.kde.kwin.direktor" 2>/dev/null || true
        qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadDeclarativeScript "$HOME/.local/share/kwin/scripts/org.kde.kwin.direktor/contents/ui/main.qml" "org.kde.kwin.direktor"
        qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start 2>/dev/null || true
        echo "[Direktor Packager] Live-reboot complete!"
    else
        echo "[Direktor Packager] Upgrade complete! Please remove and re-add in System Settings GUI (or log out and back in) to apply."
    fi
fi
