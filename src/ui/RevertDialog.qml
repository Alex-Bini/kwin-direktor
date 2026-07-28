import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

/**
 * ============================================================================
 * Direktor: Keep / Revert Safety Configuration Dialog (QML Overlay)
 * ============================================================================
 * Provides a 15-second countdown timer when testing layout or display settings.
 * Automatically triggers `revertLayout()` if user does not confirm.
 */
Dialog {
    id: revertDialog
    title: "Confirm Direktor Configuration"
    modal: true
    closePolicy: Popup.NoAutoClose
    anchors.centerIn: Overlay.overlay

    property int countdown: 15
    signal keepConfirmed()
    signal revertConfirmed()

    Timer {
        id: countdownTimer
        interval: 1000
        repeat: true
        running: true
        onTriggered: {
            revertDialog.countdown -= 1
            if (revertDialog.countdown <= 0) {
                countdownTimer.stop()
                revertDialog.revertConfirmed()
                revertDialog.close()
            }
        }
    }

    contentItem: ColumnLayout {
        spacing: 16

        Label {
            text: "Does the new layout and display configuration look right?\nIf you do not respond, previous settings will be restored automatically."
            wrapMode: Text.WordWrap
            Layout.maximumWidth: 420
        }

        ProgressBar {
            Layout.fillWidth: true
            from: 0
            to: 15
            value: revertDialog.countdown
        }
    }

    footer: DialogButtonBox {
        Button {
            text: "Keep Changes (" + revertDialog.countdown + "s)"
            highlighted: true
            onClicked: {
                countdownTimer.stop()
                revertDialog.keepConfirmed()
                revertDialog.close()
            }
        }
        Button {
            text: "Revert Now"
            onClicked: {
                countdownTimer.stop()
                revertDialog.revertConfirmed()
                revertDialog.close()
            }
        }
    }
}
