#!/usr/bin/env bash
set -e

echo "[Direktor Installer] Running package builder..."
./package.sh

OUTPUT_FILE="direktor.kwinscript"

if [ ! -f "$OUTPUT_FILE" ]; then
    echo "[Direktor Installer] Error: $OUTPUT_FILE not found after build!"
    exit 1
fi

echo "[Direktor Installer] Installing/Upgrading $OUTPUT_FILE via kpackagetool6..."
if kpackagetool6 --type KWin/Script --list | grep -q "org.kde.kwin.direktor"; then
    kpackagetool6 --type KWin/Script --upgrade "$OUTPUT_FILE"
    echo "[Direktor Installer] Upgraded existing Direktor installation."
else
    kpackagetool6 --type KWin/Script --install "$OUTPUT_FILE"
    echo "[Direktor Installer] Installed fresh Direktor package."
fi

echo "[Direktor Installer] Verification Complete!"
echo "  - KWin Script: Installed (org.kde.kwin.direktor)"
echo "  - External Directory: ~/.config/direktor"
echo "  - Rules files: ~/.config/direktor/rules.json and ~/.config/direktor/rulesrc"
echo ""
echo "Tip: To reload KWin scripts immediately without relogging, you can toggle Direktor in System Settings > KWin Scripts."
