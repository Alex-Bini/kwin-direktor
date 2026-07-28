import sys
import os
import subprocess
from PyQt6.QtCore import QObject, pyqtSlot, pyqtProperty, pyqtSignal, QTimer
from PyQt6.QtGui import QIcon, QAction
from PyQt6.QtQml import QQmlApplicationEngine
from PyQt6.QtWidgets import QApplication, QSystemTrayIcon, QMenu

class DirektorBackend(QObject):
    configChanged = pyqtSignal()
    toggleWindow = pyqtSignal()
    
    def __init__(self):
        super().__init__()
        self.reconfigureTimer = QTimer()
        self.reconfigureTimer.setSingleShot(True)
        self.reconfigureTimer.setInterval(300)
        self.reconfigureTimer.timeout.connect(self._do_reconfigure)
        
        self.sync_from_kwinrc()

    def sync_from_kwinrc(self):
        # Global Gaps
        self._gapMode = self.kreadconfig("gapMode", 0)
        self._globalPadding = self.kreadconfig("globalPadding", 8)
        self._simpleOuterGap = self.kreadconfig("simpleOuterGap", 8)
        self._simpleInnerGap = self.kreadconfig("simpleInnerGap", 8)
        self._customOuterTop = self.kreadconfig("customOuterTop", 8)
        self._customOuterBottom = self.kreadconfig("customOuterBottom", 8)
        self._customOuterLeft = self.kreadconfig("customOuterLeft", 8)
        self._customOuterRight = self.kreadconfig("customOuterRight", 8)
        self._customInnerVert = self.kreadconfig("customInnerVert", 8)
        self._customInnerHoriz = self.kreadconfig("customInnerHoriz", 8)
        
        # General
        self._defaultLayout = self.kreadconfig_str("defaultLayout", "dwindle")
        self._startFloatingDefault = self.kreadconfig_bool("startFloatingDefault", False)
        self._cycleDwindle = self.kreadconfig_bool("cycleDwindle", True)
        self._cycleColumns = self.kreadconfig_bool("cycleColumns", True)
        self._cycleMaster = self.kreadconfig_bool("cycleMaster", True)
        self._cycleFloating = self.kreadconfig_bool("cycleFloating", True)
        
        # Animation & Movement
        self._animationDuration = self.kreadconfig("animationDuration", 300)
        self._morphingLaunchDelay = self.kreadconfig("morphingLaunchDelay", 320)
        self._resizeStep = self.kreadconfig("resizeStep", 40)
        self._moveStep = self.kreadconfig("moveStep", 60)
        
        # Niri
        self._niriScrollingMode = self.kreadconfig("niriScrollingMode", 0)
        self._niriWidthOne = self.kreadconfig("niriWidthOne", 100)
        self._niriWidthTwo = self.kreadconfig("niriWidthTwo", 50)
        self._niriWidthThree = self.kreadconfig("niriWidthThree", 40)
        
        # Rules
        self._useRegexOverrides = self.kreadconfig_bool("useRegexOverrides", True)
        self._ignoreClasses = self.kreadconfig_str("ignoreClasses", "kscreenlocker,sddm,greeter,lockscreen,krunner,yakuake,spectacle,plasmashell,ksmserver,kded5,org.kde.kscreenlocker_greet,org.kde.plasmashell,pavucontrol,org.kde.polkit-kde-authentication-agent-1,org.kde.kdialog,org.kde.direktor.tray")
        self._ignoreTitles = self.kreadconfig_str("ignoreTitles", "Desktop — Plasma,Desktop,Screen Locker,Login Screen,Greeter,Open File,Save File,Authentication")
        
        # OSD
        self._osdLogging = self.kreadconfig_bool("osdLogging", True)
        self._osdCrashAlerts = self.kreadconfig_bool("osdCrashAlerts", True)
        self._osdWatchdog = self.kreadconfig_bool("osdWatchdog", True)
        self._osdNotificationStyle = self.kreadconfig("osdNotificationStyle", 2)
        
        # Advanced
        self._customShortcuts = self.kreadconfig_str("customShortcuts", "")
        self._lastLogSummary = self.kreadconfig_str("lastLogSummary", "No logs recorded yet...")
        
        # System Scan
        self.scan_system_settings()
        
        self.configChanged.emit()

    def scan_system_settings(self):
        try:
            res = subprocess.run(["kreadconfig6", "--file", "kdeglobals", "--group", "KDE", "--key", "AnimationDurationFactor"], capture_output=True, text=True)
            val = res.stdout.strip()
            self._sysAnimDuration = float(val) if val else 1.0
        except:
            self._sysAnimDuration = 1.0
            
        def read_plugin(key):
            try:
                res = subprocess.run(["kreadconfig6", "--file", "kwinrc", "--group", "Plugins", "--key", key], capture_output=True, text=True)
                val = res.stdout.strip().lower()
                if val == "false" or val == "0": return False
                # If true or empty (default on), return True
                return True
            except:
                return True
                
        self._sysGeometryChange = read_plugin("kwin4_effect_geometry_changeEnabled")
        self._sysMagicLamp = read_plugin("magiclampEnabled")
        self._sysScale = read_plugin("scaleEnabled")
        self._sysSquash = read_plugin("squashEnabled")

    def kreadconfig(self, key, default):
        try:
            res = subprocess.run(["kreadconfig6", "--file", "kwinrc", "--group", "Script-org.kde.kwin.direktor", "--key", key], capture_output=True, text=True)
            val = res.stdout.strip()
            return int(val) if val else default
        except Exception:
            return default

    def kreadconfig_bool(self, key, default):
        try:
            res = subprocess.run(["kreadconfig6", "--file", "kwinrc", "--group", "Script-org.kde.kwin.direktor", "--key", key], capture_output=True, text=True)
            val = res.stdout.strip().lower()
            if val in ("true", "1"): return True
            if val in ("false", "0"): return False
            return default
        except Exception:
            return default
            
    def kreadconfig_str(self, key, default):
        try:
            res = subprocess.run(["kreadconfig6", "--file", "kwinrc", "--group", "Script-org.kde.kwin.direktor", "--key", key], capture_output=True, text=True)
            val = res.stdout.strip()
            return val if val else default
        except Exception:
            return default

    def kwriteconfig(self, key, value):
        val_str = str(value).lower() if isinstance(value, bool) else str(value)
        subprocess.run(["kwriteconfig6", "--file", "kwinrc", "--group", "Script-org.kde.kwin.direktor", "--key", key, val_str])

    def trigger_reload(self):
        self.reconfigureTimer.start()

    def _do_reconfigure(self):
        subprocess.run(["qdbus-qt6", "org.kde.KWin", "/KWin", "reconfigure"], capture_output=True)
        subprocess.run(["qdbus-qt6", "org.kde.kglobalaccel", "/component/kwin", "invokeShortcut", "direktor_reload_config"], capture_output=True)

    def _update_val(self, key, attr_name, val):
        if getattr(self, attr_name) != val:
            setattr(self, attr_name, val)
            self.kwriteconfig(key, val)
            self.trigger_reload()
            self.configChanged.emit()

    # --- Properties ---
    
    # Gaps
    @pyqtProperty(int, notify=configChanged)
    def gapMode(self): return self._gapMode
    @gapMode.setter
    def gapMode(self, val): self._update_val("gapMode", "_gapMode", val)
    
    @pyqtProperty(int, notify=configChanged)
    def globalPadding(self): return self._globalPadding
    @globalPadding.setter
    def globalPadding(self, val): self._update_val("globalPadding", "_globalPadding", val)
    @pyqtProperty(int, notify=configChanged)
    def simpleOuterGap(self): return self._simpleOuterGap
    @simpleOuterGap.setter
    def simpleOuterGap(self, val): self._update_val("simpleOuterGap", "_simpleOuterGap", val)
    @pyqtProperty(int, notify=configChanged)
    def simpleInnerGap(self): return self._simpleInnerGap
    @simpleInnerGap.setter
    def simpleInnerGap(self, val): self._update_val("simpleInnerGap", "_simpleInnerGap", val)
    @pyqtProperty(int, notify=configChanged)
    def customOuterTop(self): return self._customOuterTop
    @customOuterTop.setter
    def customOuterTop(self, val): self._update_val("customOuterTop", "_customOuterTop", val)
    @pyqtProperty(int, notify=configChanged)
    def customOuterBottom(self): return self._customOuterBottom
    @customOuterBottom.setter
    def customOuterBottom(self, val): self._update_val("customOuterBottom", "_customOuterBottom", val)
    @pyqtProperty(int, notify=configChanged)
    def customOuterLeft(self): return self._customOuterLeft
    @customOuterLeft.setter
    def customOuterLeft(self, val): self._update_val("customOuterLeft", "_customOuterLeft", val)
    @pyqtProperty(int, notify=configChanged)
    def customOuterRight(self): return self._customOuterRight
    @customOuterRight.setter
    def customOuterRight(self, val): self._update_val("customOuterRight", "_customOuterRight", val)
    @pyqtProperty(int, notify=configChanged)
    def customInnerVert(self): return self._customInnerVert
    @customInnerVert.setter
    def customInnerVert(self, val): self._update_val("customInnerVert", "_customInnerVert", val)
    @pyqtProperty(int, notify=configChanged)
    def customInnerHoriz(self): return self._customInnerHoriz
    @customInnerHoriz.setter
    def customInnerHoriz(self, val): self._update_val("customInnerHoriz", "_customInnerHoriz", val)

    # General
    @pyqtProperty(str, notify=configChanged)
    def defaultLayout(self): return self._defaultLayout
    @defaultLayout.setter
    def defaultLayout(self, val): self._update_val("defaultLayout", "_defaultLayout", val)
    @pyqtProperty(bool, notify=configChanged)
    def startFloatingDefault(self): return self._startFloatingDefault
    @startFloatingDefault.setter
    def startFloatingDefault(self, val): self._update_val("startFloatingDefault", "_startFloatingDefault", val)
    @pyqtProperty(bool, notify=configChanged)
    def cycleDwindle(self): return self._cycleDwindle
    @cycleDwindle.setter
    def cycleDwindle(self, val): self._update_val("cycleDwindle", "_cycleDwindle", val)
    @pyqtProperty(bool, notify=configChanged)
    def cycleColumns(self): return self._cycleColumns
    @cycleColumns.setter
    def cycleColumns(self, val): self._update_val("cycleColumns", "_cycleColumns", val)
    @pyqtProperty(bool, notify=configChanged)
    def cycleMaster(self): return self._cycleMaster
    @cycleMaster.setter
    def cycleMaster(self, val): self._update_val("cycleMaster", "_cycleMaster", val)
    @pyqtProperty(bool, notify=configChanged)
    def cycleFloating(self): return self._cycleFloating
    @cycleFloating.setter
    def cycleFloating(self, val): self._update_val("cycleFloating", "_cycleFloating", val)

    # Animation & Movement
    @pyqtProperty(int, notify=configChanged)
    def animationSpeed(self): return self._animationDuration
    @animationSpeed.setter
    def animationSpeed(self, val): self._update_val("animationDuration", "_animationDuration", val)
    @pyqtProperty(int, notify=configChanged)
    def morphingLaunchDelay(self): return self._morphingLaunchDelay
    @morphingLaunchDelay.setter
    def morphingLaunchDelay(self, val): self._update_val("morphingLaunchDelay", "_morphingLaunchDelay", val)
    @pyqtProperty(int, notify=configChanged)
    def resizeStep(self): return self._resizeStep
    @resizeStep.setter
    def resizeStep(self, val): self._update_val("resizeStep", "_resizeStep", val)
    @pyqtProperty(int, notify=configChanged)
    def moveStep(self): return self._moveStep
    @moveStep.setter
    def moveStep(self, val): self._update_val("moveStep", "_moveStep", val)

    # Niri
    @pyqtProperty(int, notify=configChanged)
    def niriScrollingMode(self): return self._niriScrollingMode
    @niriScrollingMode.setter
    def niriScrollingMode(self, val): self._update_val("niriScrollingMode", "_niriScrollingMode", val)
    @pyqtProperty(int, notify=configChanged)
    def niriWidthOne(self): return self._niriWidthOne
    @niriWidthOne.setter
    def niriWidthOne(self, val): self._update_val("niriWidthOne", "_niriWidthOne", val)
    @pyqtProperty(int, notify=configChanged)
    def niriWidthTwo(self): return self._niriWidthTwo
    @niriWidthTwo.setter
    def niriWidthTwo(self, val): self._update_val("niriWidthTwo", "_niriWidthTwo", val)
    @pyqtProperty(int, notify=configChanged)
    def niriWidthThree(self): return self._niriWidthThree
    @niriWidthThree.setter
    def niriWidthThree(self, val): self._update_val("niriWidthThree", "_niriWidthThree", val)

    # Rules
    @pyqtProperty(bool, notify=configChanged)
    def useRegexOverrides(self): return self._useRegexOverrides
    @useRegexOverrides.setter
    def useRegexOverrides(self, val): self._update_val("useRegexOverrides", "_useRegexOverrides", val)
    @pyqtProperty(str, notify=configChanged)
    def ignoreClasses(self): return self._ignoreClasses
    @ignoreClasses.setter
    def ignoreClasses(self, val): self._update_val("ignoreClasses", "_ignoreClasses", val)
    @pyqtProperty(str, notify=configChanged)
    def ignoreTitles(self): return self._ignoreTitles
    @ignoreTitles.setter
    def ignoreTitles(self, val): self._update_val("ignoreTitles", "_ignoreTitles", val)

    # OSD
    @pyqtProperty(bool, notify=configChanged)
    def osdLogging(self): return self._osdLogging
    @osdLogging.setter
    def osdLogging(self, val): self._update_val("osdLogging", "_osdLogging", val)
    @pyqtProperty(bool, notify=configChanged)
    def osdCrashAlerts(self): return self._osdCrashAlerts
    @osdCrashAlerts.setter
    def osdCrashAlerts(self, val): self._update_val("osdCrashAlerts", "_osdCrashAlerts", val)
    @pyqtProperty(bool, notify=configChanged)
    def osdWatchdog(self): return self._osdWatchdog
    @osdWatchdog.setter
    def osdWatchdog(self, val): self._update_val("osdWatchdog", "_osdWatchdog", val)
    @pyqtProperty(int, notify=configChanged)
    def osdNotificationStyle(self): return self._osdNotificationStyle
    @osdNotificationStyle.setter
    def osdNotificationStyle(self, val): self._update_val("osdNotificationStyle", "_osdNotificationStyle", val)

    # Advanced
    @pyqtProperty(str, notify=configChanged)
    def customShortcuts(self): return self._customShortcuts
    @customShortcuts.setter
    def customShortcuts(self, val): self._update_val("customShortcuts", "_customShortcuts", val)
    @pyqtProperty(str, notify=configChanged)
    def lastLogSummary(self): return self._lastLogSummary

    # --- System Diagnostics Properties ---
    @pyqtProperty(float, notify=configChanged)
    def sysAnimDuration(self): return self._sysAnimDuration
    @pyqtProperty(bool, notify=configChanged)
    def sysGeometryChange(self): return self._sysGeometryChange
    @pyqtProperty(bool, notify=configChanged)
    def sysMagicLamp(self): return self._sysMagicLamp
    @pyqtProperty(bool, notify=configChanged)
    def sysScale(self): return self._sysScale
    @pyqtProperty(bool, notify=configChanged)
    def sysSquash(self): return self._sysSquash

    @pyqtSlot()
    def rescanSystemSettings(self):
        self.scan_system_settings()
        self.configChanged.emit()

    @pyqtSlot()
    def applyOptimizedSystemSettings(self):
        self.fixGlobalAnimationSpeed()
        self.fixGeometryChange()
        self.fixMagicLamp()
        self.fixScaleSquash()

    @pyqtSlot()
    def fixGlobalAnimationSpeed(self):
        subprocess.run(["kwriteconfig6", "--file", "kdeglobals", "--group", "KDE", "--key", "AnimationDurationFactor", "0.5"])
        subprocess.run(["qdbus-qt6", "org.kde.KWin", "/KWin", "reconfigure"])
        self.rescanSystemSettings()

    @pyqtSlot()
    def fixGeometryChange(self):
        subprocess.run(["kwriteconfig6", "--file", "kwinrc", "--group", "Plugins", "--key", "kwin4_effect_geometry_changeEnabled", "true"])
        subprocess.run(["qdbus-qt6", "org.kde.KWin", "/KWin", "reconfigure"])
        self.rescanSystemSettings()

    @pyqtSlot()
    def fixMagicLamp(self):
        subprocess.run(["kwriteconfig6", "--file", "kwinrc", "--group", "Plugins", "--key", "magiclampEnabled", "false"])
        subprocess.run(["qdbus-qt6", "org.kde.KWin", "/KWin", "reconfigure"])
        self.rescanSystemSettings()

    @pyqtSlot()
    def fixScaleSquash(self):
        subprocess.run(["kwriteconfig6", "--file", "kwinrc", "--group", "Plugins", "--key", "scaleEnabled", "false"])
        subprocess.run(["kwriteconfig6", "--file", "kwinrc", "--group", "Plugins", "--key", "squashEnabled", "false"])
        subprocess.run(["qdbus-qt6", "org.kde.KWin", "/KWin", "reconfigure"])
        self.rescanSystemSettings()

    @pyqtSlot()
    def pingOSD(self):
        # Ping the Plasma OSD directly as a test
        subprocess.run(["qdbus-qt6", "org.kde.plasmashell", "/org/kde/osdService", "org.kde.osdService.showText", "preferences-system-windows", "Oi Mate"])

    @pyqtSlot(str)
    def triggerShortcut(self, shortcut_name):
        subprocess.run(["qdbus-qt6", "org.kde.kglobalaccel", "/component/kwin", "invokeShortcut", shortcut_name], capture_output=True)


class DirektorTrayApp:
    def __init__(self):
        self.app = QApplication(sys.argv)
        self.app.setDesktopFileName("org.kde.direktor.tray")
        self.app.setQuitOnLastWindowClosed(False)
        
        self.backend = DirektorBackend()
        
        self.engine = QQmlApplicationEngine()
        self.engine.rootContext().setContextProperty("backend", self.backend)
        
        qml_file = os.path.join(os.path.dirname(__file__), "SettingsWindow.qml")
        self.engine.load(qml_file)
        
        if not self.engine.rootObjects():
            print("Failed to load QML layout!")
            sys.exit(-1)
            
        self.window = self.engine.rootObjects()[0]
        
        self.tray_icon = QSystemTrayIcon()
        self.tray_icon.setIcon(QIcon.fromTheme("preferences-desktop-display"))
        self.tray_icon.setToolTip("Direktor Control Center")
        
        self.menu = QMenu()
        self.action_show = QAction("Open Settings")
        self.action_show.triggered.connect(self.toggle_window)
        self.menu.addAction(self.action_show)
        
        self.action_quit = QAction("Quit Direktor Tray")
        self.action_quit.triggered.connect(self.app.quit)
        self.menu.addAction(self.action_quit)
        
        self.tray_icon.setContextMenu(self.menu)
        self.tray_icon.activated.connect(self.on_tray_activated)
        self.tray_icon.show()
        
    def toggle_window(self):
        if self.window.property("visible"):
            self.window.setProperty("visible", False)
        else:
            self.backend.sync_from_kwinrc()
            self.window.setProperty("visible", True)
            self.window.requestActivate()

    def on_tray_activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            self.toggle_window()

    def run(self):
        sys.exit(self.app.exec())

if __name__ == "__main__":
    tray = DirektorTrayApp()
    tray.run()
