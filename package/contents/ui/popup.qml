import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Window 2.15

Window {
    id: popupDialog
    flags: Qt.ToolTip | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    color: "#222c37"
    visible: false

    width: Math.max(200, messageLabel.implicitWidth + 32)
    height: Math.max(48, messageLabel.implicitHeight + 24)

    Rectangle {
        anchors.fill: parent
        color: "#222c37"
        border.color: "#3daee9"
        border.width: 2
        radius: 8

        Label {
            id: messageLabel
            anchors.centerIn: parent
            font.pointSize: 13
            font.weight: Font.Bold
            color: "#ffffff"
        }
    }

    Timer {
        id: hideTimer
        repeat: false
        onTriggered: {
            popupDialog.visible = false;
        }
    }

    function show(text, area, duration) {
        hideTimer.stop();
        messageLabel.text = text;
        
        var targetW = Math.max(200, messageLabel.implicitWidth + 32);
        var targetH = Math.max(48, messageLabel.implicitHeight + 24);
        popupDialog.width = targetW;
        popupDialog.height = targetH;
        
        var screenArea = area || { x: 0, y: 0, width: 1920, height: 1080 };
        popupDialog.x = Math.round((screenArea.x + screenArea.width / 2) - (targetW / 2));
        popupDialog.y = Math.round((screenArea.y + screenArea.height / 2) - (targetH / 2));
        
        popupDialog.visible = true;
        hideTimer.interval = duration || 1200;
        hideTimer.start();
    }
}
