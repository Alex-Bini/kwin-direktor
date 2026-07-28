import QtQuick
import QtQuick.Controls
import QtQuick.Window
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.extras as PlasmaExtras
import org.kde.kirigami as Kirigami
import org.kde.ksvg as KSvg
import org.kde.kwin
import "../code/engine.js" as DirektorBundle

Item {
    id: scriptRoot
    property var engineInstance: null

    Connections {
        target: typeof options !== "undefined" ? options : null
        ignoreUnknownSignals: true
        function onConfigChanged() {
            console.warn("[Direktor QML] options.configChanged emitted. Reloading engine configuration...");
            if (scriptRoot.engineInstance && typeof scriptRoot.engineInstance.reloadConfiguration === "function") {
                scriptRoot.engineInstance.reloadConfiguration(true);
            }
        }
    }

    Connections {
        target: typeof workspace !== "undefined" ? workspace : null
        ignoreUnknownSignals: true
        function onConfigChanged() {
            console.warn("[Direktor QML] workspace.configChanged emitted. Reloading engine configuration...");
            if (scriptRoot.engineInstance && typeof scriptRoot.engineInstance.reloadConfiguration === "function") {
                scriptRoot.engineInstance.reloadConfiguration(true);
            }
        }
    }

    PlasmaCore.Window {
        id: osdWindow
        visible: false
        flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
        color: "transparent"

        property string messageText: ""

        width: mainItem.implicitWidth
        height: mainItem.implicitHeight

        mainItem: Item {
            id: dialogItem
            implicitWidth: Math.max(240, contentLayout.implicitWidth + (frame.margins ? frame.margins.left + frame.margins.right : 32) + 32)
            implicitHeight: Math.max(64, contentLayout.implicitHeight + (frame.margins ? frame.margins.top + frame.margins.bottom : 24) + 20)

            KSvg.FrameSvgItem {
                id: frame
                anchors.fill: parent
                imagePath: "dialogs/background"

                Kirigami.Theme.inherit: false
                Kirigami.Theme.colorSet: Kirigami.Theme.Window

                Row {
                    id: contentLayout
                    anchors.centerIn: parent
                    spacing: Kirigami.Units.largeSpacing

                    Kirigami.Icon {
                        source: "preferences-system-windows"
                        width: Kirigami.Units.iconSizes.medium
                        height: Kirigami.Units.iconSizes.medium
                        anchors.verticalCenter: parent.verticalCenter
                    }

                    PlasmaExtras.Heading {
                        level: 3
                        text: osdWindow.messageText
                        anchors.verticalCenter: parent.verticalCenter
                        wrapMode: Text.NoWrap
                        elide: Text.ElideRight
                    }
                }

                Timer {
                    id: hideTimer
                    repeat: false
                    onTriggered: {
                        osdWindow.visible = false;
                    }
                }
            }
        }

        function show(text, area, duration) {
            hideTimer.stop();
            osdWindow.messageText = text;
            
            var targetW = Math.max(240, contentLayout.implicitWidth + (frame.margins ? frame.margins.left + frame.margins.right : 32) + 32);
            var targetH = Math.max(64, contentLayout.implicitHeight + (frame.margins ? frame.margins.top + frame.margins.bottom : 24) + 20);
            
            var screenArea = area || { x: 0, y: 0, width: 1920, height: 1080 };
            osdWindow.width = targetW;
            osdWindow.height = targetH;
            osdWindow.x = Math.round((screenArea.x + screenArea.width / 2) - (targetW / 2));
            osdWindow.y = Math.round((screenArea.y + screenArea.height / 2) - (targetH / 2));
            
            osdWindow.visible = true;
            hideTimer.interval = duration || 1400;
            hideTimer.start();
        }
    }

    property var _shortcutMap: ({})

    function createShortcut(id, title, sequence, callback) {
        try {
            if (scriptRoot._shortcutMap[id]) {
                return scriptRoot._shortcutMap[id];
            }
            var qmlString = 'import QtQuick 2.15\nimport org.kde.kwin 3.0\nShortcutHandler {\n    name: "' + id + '"\n    text: "' + title + '"\n    sequence: "' + sequence + '"\n}';
            var obj = Qt.createQmlObject(qmlString, scriptRoot, "Shortcut_" + id);
            if (obj && typeof callback === "function") {
                obj.activated.connect(callback);
            }
            scriptRoot._shortcutMap[id] = obj;
            return obj;
        } catch (e) {
            console.warn("[Direktor] Failed to create shortcut " + id + ": " + e);
            return null;
        }
    }

    Component.onCompleted: {
        console.warn("[Direktor] QML Declarative entrypoint initialized. Starting Direktor engine v1...");
        try {
            if (typeof workspace !== "undefined") {
                workspace._direktorPopup = osdWindow;
                workspace._direktorMakeQRect = function(x, y, w, h) { return Qt.rect(x, y, w, h); };
            }
            if (typeof Workspace !== "undefined") {
                Workspace._direktorPopup = osdWindow;
                Workspace._direktorMakeQRect = function(x, y, w, h) { return Qt.rect(x, y, w, h); };
            }
        } catch (e) {
            console.warn("[Direktor] Error registering popup bridge: " + e);
        }

        try {
            if (typeof DirektorBundle !== "undefined" && typeof DirektorBundle.startDirektor === "function") {
                scriptRoot.engineInstance = DirektorBundle.startDirektor({
                    "popupDialog": osdWindow,
                    "workspace": (typeof Workspace !== "undefined" ? Workspace : (typeof workspace !== "undefined" ? workspace : null)),
                    "kwin": (typeof KWin !== "undefined" ? KWin : null),
                    "registerShortcut": createShortcut
                });
            } else {
                console.warn("[Direktor] Could not find startDirektor on DirektorBundle");
            }
        } catch (e) {
            console.warn("[Direktor] Error starting engine from QML: " + e);
        }
    }
}
