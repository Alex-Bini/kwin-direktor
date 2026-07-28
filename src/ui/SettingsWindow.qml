import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents3

QQC2.ApplicationWindow {
    id: root
    width: 600
    height: 650
    visible: false
    title: "Direktor Control Center"
    
    // Connect to Python for explicit show/hide
    Connections {
        target: backend
        function onToggleWindow() {
            if (root.visible) { root.hide(); } else { root.showNormal(); root.requestActivate(); }
        }
    }
    
    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        
        QQC2.TabBar {
            id: tabBar
            Layout.fillWidth: true
            QQC2.TabButton { text: qsTr("Dashboard") }
            QQC2.TabButton { text: qsTr("Layout & Gaps") }
            QQC2.TabButton { text: qsTr("Rules & Overrides") }
            QQC2.TabButton { text: qsTr("OSD & Advanced") }
            QQC2.TabButton { text: qsTr("System Optimizer") }
        }

        StackLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            currentIndex: tabBar.currentIndex
            
            // Tab 1: Dashboard
            Item {
                ColumnLayout {
                    anchors.centerIn: parent
                    spacing: 20
                    
                    Kirigami.Icon {
                        source: "preferences-system-windows"
                        width: 96
                        height: 96
                        Layout.alignment: Qt.AlignHCenter
                    }
                    
                    PlasmaComponents3.Label {
                        text: "Direktor is Active"
                        font.pointSize: 18
                        font.weight: Font.Bold
                        Layout.alignment: Qt.AlignHCenter
                    }
                    
                    RowLayout {
                        spacing: 20
                        Layout.alignment: Qt.AlignHCenter
                        
                        PlasmaComponents3.Button {
                            text: "Cycle Layout Engine"
                            icon.name: "view-split-left-right"
                            onClicked: backend.triggerShortcut("cycle_layout")
                        }
                        
                        PlasmaComponents3.Button {
                            text: "Toggle Floating State"
                            icon.name: "window-pop-out"
                            onClicked: backend.triggerShortcut("toggle_floating")
                        }
                    }
                }
            }
            
            // Tab 2: Layouts & Gaps
            Item {
                QQC2.ScrollView {
                    anchors.fill: parent
                    anchors.margins: 20
                    contentWidth: parent.width - 40
                    
                    ColumnLayout {
                        width: parent.width
                        spacing: 15
                        
                        PlasmaComponents3.Label { text: "<h3>Engine & Cycling</h3>"; textFormat: Text.RichText }
                        RowLayout {
                            PlasmaComponents3.Label { text: "Default Engine:" }
                            PlasmaComponents3.ComboBox {
                                model: ["dwindle", "columns", "master", "floating"]
                                currentIndex: model.indexOf(backend.defaultLayout)
                                onActivated: backend.defaultLayout = model[currentIndex]
                            }
                        }
                        PlasmaComponents3.CheckBox { text: "Start floating on new monitors"; checked: backend.startFloatingDefault; onCheckedChanged: backend.startFloatingDefault = checked }
                        
                        PlasmaComponents3.Label { text: "Active Layouts in Cycle Rotation:" }
                        RowLayout {
                            PlasmaComponents3.CheckBox { text: "Dwindle"; checked: backend.cycleDwindle; onCheckedChanged: backend.cycleDwindle = checked }
                            PlasmaComponents3.CheckBox { text: "Columns"; checked: backend.cycleColumns; onCheckedChanged: backend.cycleColumns = checked }
                            PlasmaComponents3.CheckBox { text: "Master"; checked: backend.cycleMaster; onCheckedChanged: backend.cycleMaster = checked }
                            PlasmaComponents3.CheckBox { text: "Floating"; checked: backend.cycleFloating; onCheckedChanged: backend.cycleFloating = checked }
                        }

                        Kirigami.Separator { Layout.fillWidth: true }
                        PlasmaComponents3.Label { text: "<h3>Gap Engine (Global)</h3>"; textFormat: Text.RichText }
                        
                        RowLayout {
                            PlasmaComponents3.Label { text: "Active Gap Tier:" }
                            PlasmaComponents3.ComboBox {
                                id: gapModeCombo
                                Layout.fillWidth: true
                                model: ["Unified Mode", "Simple Mode", "User Defined Mode"]
                                currentIndex: backend.gapMode
                                onActivated: backend.gapMode = currentIndex
                            }
                        }
                        
                        // --- UNIFIED TIER ---
                        ColumnLayout {
                            Layout.fillWidth: true
                            visible: backend.gapMode === 0
                            spacing: 5
                            PlasmaComponents3.Label { text: "Global Padding (All Directions):" }
                            RowLayout {
                                PlasmaComponents3.Slider { from: 0; to: 100; stepSize: 1; value: backend.globalPadding; onMoved: backend.globalPadding = value; Layout.fillWidth: true }
                                PlasmaComponents3.SpinBox { from: 0; to: 100; stepSize: 1; value: backend.globalPadding; onValueChanged: backend.globalPadding = value }
                            }
                        }

                        // --- SIMPLE TIER ---
                        ColumnLayout {
                            Layout.fillWidth: true
                            visible: backend.gapMode === 1
                            spacing: 5
                            PlasmaComponents3.Label { text: "Outer Gaps (Screen Edge):" }
                            RowLayout {
                                PlasmaComponents3.Slider { from: 0; to: 100; stepSize: 1; value: backend.simpleOuterGap; onMoved: backend.simpleOuterGap = value; Layout.fillWidth: true }
                                PlasmaComponents3.SpinBox { from: 0; to: 100; value: backend.simpleOuterGap; onValueChanged: backend.simpleOuterGap = value }
                            }
                            PlasmaComponents3.Label { text: "Inner Gaps (Between Windows):" }
                            RowLayout {
                                PlasmaComponents3.Slider { from: 0; to: 100; stepSize: 1; value: backend.simpleInnerGap; onMoved: backend.simpleInnerGap = value; Layout.fillWidth: true }
                                PlasmaComponents3.SpinBox { from: 0; to: 100; value: backend.simpleInnerGap; onValueChanged: backend.simpleInnerGap = value }
                            }
                        }
                        
                        // --- CUSTOM TIER ---
                        ColumnLayout {
                            Layout.fillWidth: true
                            visible: backend.gapMode === 2
                            spacing: 2
                            PlasmaComponents3.Label { text: "Outer Gap - Top:" }
                            RowLayout { PlasmaComponents3.Slider { from: 0; to: 100; stepSize: 1; value: backend.customOuterTop; onMoved: backend.customOuterTop = value; Layout.fillWidth: true } PlasmaComponents3.SpinBox { from: 0; to: 100; value: backend.customOuterTop; onValueChanged: backend.customOuterTop = value } }
                            PlasmaComponents3.Label { text: "Outer Gap - Bottom:" }
                            RowLayout { PlasmaComponents3.Slider { from: 0; to: 100; stepSize: 1; value: backend.customOuterBottom; onMoved: backend.customOuterBottom = value; Layout.fillWidth: true } PlasmaComponents3.SpinBox { from: 0; to: 100; value: backend.customOuterBottom; onValueChanged: backend.customOuterBottom = value } }
                            PlasmaComponents3.Label { text: "Outer Gap - Left:" }
                            RowLayout { PlasmaComponents3.Slider { from: 0; to: 100; stepSize: 1; value: backend.customOuterLeft; onMoved: backend.customOuterLeft = value; Layout.fillWidth: true } PlasmaComponents3.SpinBox { from: 0; to: 100; value: backend.customOuterLeft; onValueChanged: backend.customOuterLeft = value } }
                            PlasmaComponents3.Label { text: "Outer Gap - Right:" }
                            RowLayout { PlasmaComponents3.Slider { from: 0; to: 100; stepSize: 1; value: backend.customOuterRight; onMoved: backend.customOuterRight = value; Layout.fillWidth: true } PlasmaComponents3.SpinBox { from: 0; to: 100; value: backend.customOuterRight; onValueChanged: backend.customOuterRight = value } }
                            PlasmaComponents3.Label { text: "Inner Gap - Vertical:" }
                            RowLayout { PlasmaComponents3.Slider { from: 0; to: 100; stepSize: 1; value: backend.customInnerVert; onMoved: backend.customInnerVert = value; Layout.fillWidth: true } PlasmaComponents3.SpinBox { from: 0; to: 100; value: backend.customInnerVert; onValueChanged: backend.customInnerVert = value } }
                            PlasmaComponents3.Label { text: "Inner Gap - Horizontal:" }
                            RowLayout { PlasmaComponents3.Slider { from: 0; to: 100; stepSize: 1; value: backend.customInnerHoriz; onMoved: backend.customInnerHoriz = value; Layout.fillWidth: true } PlasmaComponents3.SpinBox { from: 0; to: 100; value: backend.customInnerHoriz; onValueChanged: backend.customInnerHoriz = value } }
                        }
                        
                        Kirigami.Separator { Layout.fillWidth: true }
                        PlasmaComponents3.Label { text: "<h3>Movement & Animation</h3>"; textFormat: Text.RichText }
                        RowLayout {
                            PlasmaComponents3.Label { text: "Closing Animation Speed (ms):" }
                            PlasmaComponents3.SpinBox { from: 50; to: 1000; stepSize: 50; value: backend.animationSpeed; onValueChanged: backend.animationSpeed = value }
                        }
                        RowLayout {
                            PlasmaComponents3.Label { text: "Launch Delay (ms):" }
                            PlasmaComponents3.SpinBox { from: 50; to: 1000; stepSize: 50; value: backend.morphingLaunchDelay; onValueChanged: backend.morphingLaunchDelay = value }
                        }
                        RowLayout {
                            PlasmaComponents3.Label { text: "Resize Step (px):" }
                            PlasmaComponents3.SpinBox { from: 10; to: 200; stepSize: 10; value: backend.resizeStep; onValueChanged: backend.resizeStep = value }
                        }
                        RowLayout {
                            PlasmaComponents3.Label { text: "Move Step (px):" }
                            PlasmaComponents3.SpinBox { from: 10; to: 200; stepSize: 10; value: backend.moveStep; onValueChanged: backend.moveStep = value }
                        }
                        
                        Kirigami.Separator { Layout.fillWidth: true }
                        PlasmaComponents3.Label { text: "<h3>Columns Settings (Niri)</h3>"; textFormat: Text.RichText }
                        RowLayout {
                            PlasmaComponents3.Label { text: "Scrolling Mode:" }
                            PlasmaComponents3.ComboBox {
                                model: ["Strict Center", "Center Pairs"]
                                currentIndex: backend.niriScrollingMode
                                onActivated: backend.niriScrollingMode = currentIndex
                            }
                        }
                        RowLayout {
                            PlasmaComponents3.Label { text: "Width (1 Window %):" }
                            PlasmaComponents3.SpinBox { from: 10; to: 100; value: backend.niriWidthOne; onValueChanged: backend.niriWidthOne = value }
                        }
                        RowLayout {
                            PlasmaComponents3.Label { text: "Width (2 Windows %):" }
                            PlasmaComponents3.SpinBox { from: 10; to: 100; value: backend.niriWidthTwo; onValueChanged: backend.niriWidthTwo = value }
                        }
                        RowLayout {
                            PlasmaComponents3.Label { text: "Width (3+ Windows %):" }
                            PlasmaComponents3.SpinBox { from: 10; to: 100; value: backend.niriWidthThree; onValueChanged: backend.niriWidthThree = value }
                        }
                        
                        Item { Layout.fillHeight: true } // Spacer
                    }
                }
            }
            
            // Tab 3: Window Rules
            Item {
                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 20
                    spacing: 15
                    
                    PlasmaComponents3.CheckBox {
                        text: "Enable Regex Overrides"
                        checked: backend.useRegexOverrides
                        onCheckedChanged: backend.useRegexOverrides = checked
                    }
                    
                    PlasmaComponents3.Label { text: "<b>Ignored Window Classes (comma separated):</b>"; textFormat: Text.RichText }
                    QQC2.TextArea {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 120
                        text: backend.ignoreClasses
                        wrapMode: TextEdit.Wrap
                        onTextChanged: backend.ignoreClasses = text
                    }
                    
                    PlasmaComponents3.Label { text: "<b>Ignored Window Titles (comma separated):</b>"; textFormat: Text.RichText }
                    QQC2.TextArea {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 120
                        text: backend.ignoreTitles
                        wrapMode: TextEdit.Wrap
                        onTextChanged: backend.ignoreTitles = text
                    }
                    
                    Item { Layout.fillHeight: true }
                }
            }
            
            // Tab 4: OSD & Advanced
            Item {
                QQC2.ScrollView {
                    anchors.fill: parent
                    anchors.margins: 20
                    contentWidth: parent.width - 40
                    
                    ColumnLayout {
                        width: parent.width
                        spacing: 15
                        
                        PlasmaComponents3.Label { text: "<h3>Direktor-OSD Daemon</h3>"; textFormat: Text.RichText }
                        PlasmaComponents3.CheckBox { text: "Enable Rotating File Logger"; checked: backend.osdLogging; onCheckedChanged: backend.osdLogging = checked }
                        PlasmaComponents3.CheckBox { text: "Enable Crash Interception Toasts"; checked: backend.osdCrashAlerts; onCheckedChanged: backend.osdCrashAlerts = checked }
                        PlasmaComponents3.CheckBox { text: "Enable Liveness Auto-Revive"; checked: backend.osdWatchdog; onCheckedChanged: backend.osdWatchdog = checked }
                        
                        RowLayout {
                            PlasmaComponents3.Label { text: "Notification Style:" }
                            PlasmaComponents3.ComboBox {
                                model: ["Plasma OSD Pill", "Desktop Toast", "Both"]
                                currentIndex: backend.osdNotificationStyle
                                onActivated: backend.osdNotificationStyle = currentIndex
                            }
                            Item { Layout.fillWidth: true } // Spacer
                            PlasmaComponents3.Button {
                                text: "Ping OSD"
                                icon.name: "system-run"
                                onClicked: backend.pingOSD()
                            }
                        }

                        Kirigami.Separator { Layout.fillWidth: true }
                        PlasmaComponents3.Label { text: "<h3>Custom Shortcuts (Advanced)</h3>"; textFormat: Text.RichText }
                        QQC2.TextArea {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 100
                            text: backend.customShortcuts
                            wrapMode: TextEdit.Wrap
                            placeholderText: "# bind = \"Shortcut name\", \"Action\", \"Message\""
                            onTextChanged: backend.customShortcuts = text
                        }
                        
                        Kirigami.Separator { Layout.fillWidth: true }
                        PlasmaComponents3.Label { text: "<h3>Diagnostics</h3>"; textFormat: Text.RichText }
                        QQC2.TextArea {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 100
                            text: backend.lastLogSummary
                            wrapMode: TextEdit.Wrap
                            readOnly: true
                        }
                        
                        Item { Layout.fillHeight: true }
                    }
                }
            }

            // Tab 5: System Optimizer
            Item {
                QQC2.ScrollView {
                    anchors.fill: parent
                    anchors.margins: 20
                    contentWidth: parent.width - 40
                    
                    ColumnLayout {
                        width: parent.width
                        spacing: 15
                        
                        PlasmaComponents3.Label { text: "<h3>Plasma Effects Diagnostic</h3>"; textFormat: Text.RichText }
                        PlasmaComponents3.Label { 
                            text: "Wayland tiling relies on Plasma's native window effects. Misconfigured effects or slow animation durations can cause layout stuttering, visual artifacts, or delayed geometry updates."
                            wrapMode: Text.WordWrap; Layout.fillWidth: true 
                        }
                        
                        Kirigami.FormLayout {
                            Layout.fillWidth: true
                            RowLayout {
                                Kirigami.FormData.label: "Global Animation Speed:"
                                PlasmaComponents3.Label {
                                    text: backend.sysAnimDuration <= 0.5 ? "Optimized: Full compatibility" : (backend.sysAnimDuration <= 1.0 ? "Questionable: Might cause minor issues" : "Conflicting: 100% will cause issues")
                                    color: backend.sysAnimDuration <= 0.5 ? Kirigami.Theme.positiveTextColor : (backend.sysAnimDuration <= 1.0 ? Kirigami.Theme.neutralTextColor : Kirigami.Theme.negativeTextColor)
                                }
                                Kirigami.Icon {
                                    source: "help-contextual"
                                    width: 16; height: 16
                                    MouseArea {
                                        anchors.fill: parent; hoverEnabled: true
                                        PlasmaComponents3.ToolTip.text: "Animation Duration Factor: " + backend.sysAnimDuration + "x. Slow global animations delay Direktor's tiling events, making window management feel sluggish."
                                        PlasmaComponents3.ToolTip.visible: containsMouse
                                    }
                                }
                                PlasmaComponents3.ToolButton {
                                    icon.name: "tools"
                                    text: "Fix"
                                    display: PlasmaComponents3.AbstractButton.TextBesideIcon
                                    visible: backend.sysAnimDuration > 0.5
                                    onClicked: backend.fixGlobalAnimationSpeed()
                                }
                            }
                            RowLayout {
                                Kirigami.FormData.label: "Geometry Change Effect:"
                                PlasmaComponents3.Label {
                                    text: backend.sysGeometryChange ? "Optimized: Full compatibility" : "Conflicting: 100% will cause issues"
                                    color: backend.sysGeometryChange ? Kirigami.Theme.positiveTextColor : Kirigami.Theme.negativeTextColor
                                }
                                Kirigami.Icon {
                                    source: "help-contextual"
                                    width: 16; height: 16
                                    MouseArea {
                                        anchors.fill: parent; hoverEnabled: true
                                        PlasmaComponents3.ToolTip.text: "Essential for tiling! If disabled, windows will snap rigidly without smooth transitions when the layout resizes."
                                        PlasmaComponents3.ToolTip.visible: containsMouse
                                    }
                                }
                                PlasmaComponents3.ToolButton {
                                    icon.name: "tools"
                                    text: "Fix"
                                    display: PlasmaComponents3.AbstractButton.TextBesideIcon
                                    visible: !backend.sysGeometryChange
                                    onClicked: backend.fixGeometryChange()
                                }
                            }
                            RowLayout {
                                Kirigami.FormData.label: "Magic Lamp Minimize:"
                                PlasmaComponents3.Label {
                                    text: backend.sysMagicLamp ? "Conflicting: 100% will cause issues" : "Optimized: Full compatibility"
                                    color: !backend.sysMagicLamp ? Kirigami.Theme.positiveTextColor : Kirigami.Theme.negativeTextColor
                                }
                                Kirigami.Icon {
                                    source: "help-contextual"
                                    width: 16; height: 16
                                    MouseArea {
                                        anchors.fill: parent; hoverEnabled: true
                                        PlasmaComponents3.ToolTip.text: "Delays the window unmapping process for 300ms, causing the layout to hesitate before closing empty space and warping borders."
                                        PlasmaComponents3.ToolTip.visible: containsMouse
                                    }
                                }
                                PlasmaComponents3.ToolButton {
                                    icon.name: "tools"
                                    text: "Fix"
                                    display: PlasmaComponents3.AbstractButton.TextBesideIcon
                                    visible: backend.sysMagicLamp
                                    onClicked: backend.fixMagicLamp()
                                }
                            }
                            RowLayout {
                                Kirigami.FormData.label: "Scale / Squash Effects:"
                                PlasmaComponents3.Label {
                                    text: (backend.sysScale || backend.sysSquash) ? "Questionable: Might cause minor issues" : "Optimized: Full compatibility"
                                    color: !(backend.sysScale || backend.sysSquash) ? Kirigami.Theme.positiveTextColor : Kirigami.Theme.neutralTextColor
                                }
                                Kirigami.Icon {
                                    source: "help-contextual"
                                    width: 16; height: 16
                                    MouseArea {
                                        anchors.fill: parent; hoverEnabled: true
                                        PlasmaComponents3.ToolTip.text: "Takes control of window geometry during spawning, causing windows to spawn in the center and jump to their tiles instead of fluidly morphing."
                                        PlasmaComponents3.ToolTip.visible: containsMouse
                                    }
                                }
                                PlasmaComponents3.ToolButton {
                                    icon.name: "tools"
                                    text: "Fix"
                                    display: PlasmaComponents3.AbstractButton.TextBesideIcon
                                    visible: backend.sysScale || backend.sysSquash
                                    onClicked: backend.fixScaleSquash()
                                }
                            }
                        }
                        
                        Item { Layout.preferredHeight: 10 }
                        
                        RowLayout {
                            Layout.alignment: Qt.AlignHCenter
                            spacing: 15
                            
                            PlasmaComponents3.Button {
                                text: "Scan Animations"
                                icon.name: "system-search"
                                onClicked: backend.rescanSystemSettings()
                            }
                            
                            PlasmaComponents3.Button {
                                text: "Auto-Fix & Optimize All Plasma Settings"
                                icon.name: "run-build"
                                onClicked: backend.applyOptimizedSystemSettings()
                            }
                        }
                        
                        Item { Layout.fillHeight: true }
                    }
                }
            }
        }
    }
}
