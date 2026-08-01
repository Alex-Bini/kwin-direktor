/**
 * ============================================================================
 * Direktor: JSON Configuration Manager
 * ============================================================================
 * Manages loading, validating, and applying `~/.config/direktor/config.json`.
 * Controls global padding, default layouts per monitor, and window rules.
 */

export const DEFAULT_CONFIG = {
    version: "1.0",
    general: {
        defaultLayout: "dwindle",
        padding: 8,                // Global padding between windows and screen edges in px
        animationDuration: 300,    // Window animation duration in milliseconds
        resizeStep: 40,            // Step size for window resize actions in px
        moveStep: 60,              // Step size for window move actions in px
        watchdogMaxRetries: 20,    // Max number of retries for the geometry watchdog
        watchdogRetryDelayMs: 100, // Delay in ms between watchdog retries
        floatingCascadeOffset: 32, // Offset in px for cascading floating windows
        dwindleOuterGapTop: 8,     // Dwindle top outer screen gap in px
        dwindleOuterGapBottom: 8,  // Dwindle bottom outer screen gap in px
        dwindleOuterGapLeft: 8,    // Dwindle left outer screen gap in px
        dwindleOuterGapRight: 8,   // Dwindle right outer screen gap in px
        dwindleInnerGapVertical: 8,   // Dwindle inner vertical gap between windows in px
        dwindleInnerGapHorizontal: 8, // Dwindle inner horizontal gap between windows in px
        revertTimeoutSeconds: 15   // Safety timeout when testing configurations
    },
    monitors: {
        // Output-specific overrides, e.g. "DP-1": { "layout": "niri-scrollable" }
    },
    rules: [
        {
            match: { resourceClass: "krunner" },
            action: "ignore"
        },
        {
            match: { resourceClass: "yakuake" },
            action: "ignore"
        },
        {
            match: { resourceClass: "org.kde.spectacle" },
            action: "float"
        },
        {
            match: { dialog: true },
            action: "float"
        }
    ],
    shortcuts: {
        "toggle_floating": "Meta+Shift+F",
        "cycle_layout": "Meta+Space",
        "promote_master": "Meta+Return",
        "focus_left": "Meta+Left",
        "focus_right": "Meta+Right",
        "focus_up": "Meta+Up",
        "focus_down": "Meta+Down",
        "move_left": "Meta+Shift+Left",
        "move_right": "Meta+Shift+Right",
        "move_up": "Meta+Shift+Up",
        "move_down": "Meta+Shift+Down",
        "togglesplit": "Meta+J",
        "pseudotile": "Meta+P",
        "increase_width": "Meta+Ctrl+Right",
        "decrease_width": "Meta+Ctrl+Left",
        "increase_height": "Meta+Ctrl+Up",
        "decrease_height": "Meta+Ctrl+Down",
        "reload_config": "Meta+Shift+R"
    }
};

export class ConfigManager {
    constructor() {
        this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.onConfigChangedCallbacks = [];
        this.reloadFromKWin();
    }

    /**
     * Loads JSON configuration from string or object.
     * In KWin Plasma 6 scripting, file I/O can be bridged via QML XMLHttpRequest
     * or KConfig backend.
     * @param {Object|string} rawConfig
     */
    loadConfig(rawConfig) {
        try {
            const parsed = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
            this.config = this.mergeConfig(DEFAULT_CONFIG, parsed);
            this.notifyConfigChanged();
            return true;
        } catch (err) {
            print(`[Direktor ConfigManager] Error loading JSON config: ${err}`);
            return false;
        }
    }

    mergeConfig(base, override) {
        const result = Object.assign({}, base);
        for (const key of Object.keys(override || {})) {
            if (override[key] && typeof override[key] === "object" && !Array.isArray(override[key])) {
                result[key] = this.mergeConfig(base[key] || {}, override[key]);
            } else {
                result[key] = override[key];
            }
        }
        return result;
    }

    getGapsForLayout(layoutId) {
        if (!this.config || !this.config.general || !this.config.general.gaps) {
            return { outerTop: 0, outerBottom: 0, outerLeft: 0, outerRight: 0, innerVert: 0, innerHoriz: 0 };
        }
        const mode = this.config.general.gapMode || 0;
        const g = this.config.general.gaps;
        
        if (mode === 0) { // Unified
            return { outerTop: g.globalPadding, outerBottom: g.globalPadding, outerLeft: g.globalPadding, outerRight: g.globalPadding, innerVert: g.globalPadding, innerHoriz: g.globalPadding };
        } else if (mode === 1) { // Simple
            return { outerTop: g.simpleOuterGap, outerBottom: g.simpleOuterGap, outerLeft: g.simpleOuterGap, outerRight: g.simpleOuterGap, innerVert: g.simpleInnerGap, innerHoriz: g.simpleInnerGap };
        } else { // Custom
            return { outerTop: g.customOuterTop, outerBottom: g.customOuterBottom, outerLeft: g.customOuterLeft, outerRight: g.customOuterRight, innerVert: g.customInnerVert, innerHoriz: g.customInnerHoriz };
        }
    }

    getGeneralSettings() {
        return this.config.general || DEFAULT_CONFIG.general;
    }

    getRules() {
        return this.config.rules || [];
    }

    getLayoutForMonitor(outputName) {
        if (this.config.monitors && this.config.monitors[outputName]) {
            return this.config.monitors[outputName].layout || this.config.general.defaultLayout;
        }
        return this.config.general.defaultLayout;
    }

    reloadFromKWin(force = false) {
        if (typeof KWin === "undefined" || typeof KWin.readConfig !== "function") return { changed: false, rulesChanged: false };
        const now = Date.now();
        if (!force && this._lastReload && (now - this._lastReload < 500)) {
            return { changed: false, rulesChanged: false };
        }
        this._lastReload = now;
        try {
            const getVal = (key, readKey, defVal) => {
                // If force is true, bypass the cached `options` object entirely and read fresh from KSharedConfig
                if (!force && typeof options !== "undefined" && typeof options[key] !== "undefined") {
                    return options[key];
                }
                return typeof KWin !== "undefined" && typeof KWin.readConfig === "function" ? KWin.readConfig(key, defVal) : defVal;
            };

            let rawLayout = String(getVal("defaultLayout", "defaultLayout", "dwindle"));
            if (rawLayout === "0") rawLayout = "dwindle";
            else if (rawLayout === "1") rawLayout = "niri-scrollable";
            else if (rawLayout === "2") rawLayout = "master-stack";
            else if (rawLayout === "3") rawLayout = "floating";
            this.config.general.defaultLayout = rawLayout;
            this.config.general.gapMode = parseInt(getVal("gapMode", "gapMode", 0), 10);
            this.config.general.gaps = {};
            this.config.general.gaps.globalPadding = parseInt(getVal("globalPadding", "globalPadding", 8), 10);
            this.config.general.gaps.simpleOuterGap = parseInt(getVal("simpleOuterGap", "simpleOuterGap", 8), 10);
            this.config.general.gaps.simpleInnerGap = parseInt(getVal("simpleInnerGap", "simpleInnerGap", 8), 10);
            this.config.general.gaps.customOuterTop = parseInt(getVal("customOuterTop", "customOuterTop", 8), 10);
            this.config.general.gaps.customOuterBottom = parseInt(getVal("customOuterBottom", "customOuterBottom", 8), 10);
            this.config.general.gaps.customOuterLeft = parseInt(getVal("customOuterLeft", "customOuterLeft", 8), 10);
            this.config.general.gaps.customOuterRight = parseInt(getVal("customOuterRight", "customOuterRight", 8), 10);
            this.config.general.gaps.customInnerVert = parseInt(getVal("customInnerVert", "customInnerVert", 8), 10);
            this.config.general.gaps.customInnerHoriz = parseInt(getVal("customInnerHoriz", "customInnerHoriz", 8), 10);
            
            this.config.general.animationDuration = parseInt(getVal("animationDuration", "animationDuration", 300), 10);
            this.config.general.morphingLaunchDelay = parseInt(getVal("morphingLaunchDelay", "morphingLaunchDelay", 320), 10);
            this.config.general.resizeStep = parseInt(getVal("resizeStep", "resizeStep", 40), 10);
            this.config.general.moveStep = parseInt(getVal("moveStep", "moveStep", 60), 10);
            this.config.general.watchdogMaxRetries = parseInt(getVal("watchdogMaxRetries", "watchdogMaxRetries", 20), 10);
            this.config.general.watchdogRetryDelayMs = parseInt(getVal("watchdogRetryDelayMs", "watchdogRetryDelayMs", 100), 10);
            this.config.general.floatingCascadeOffset = parseInt(getVal("floatingCascadeOffset", "floatingCascadeOffset", 32), 10);
            this.config.general.startFloatingDefault = (getVal("startFloatingDefault", "startFloatingDefault", false) === true);
            this.config.general.cycleDwindle = (getVal("cycleDwindle", "cycleDwindle", true) === true);
            this.config.general.cycleColumns = (getVal("cycleColumns", "cycleColumns", true) === true);
            this.config.general.cycleMaster = (getVal("cycleMaster", "cycleMaster", true) === true);
            this.config.general.cycleFloating = (getVal("cycleFloating", "cycleFloating", true) === true);
            this.config.general.niriScrollingMode = parseInt(getVal("niriScrollingMode", "niriScrollingMode", 0), 10);
            this.config.general.niriWidthOne = parseInt(getVal("niriWidthOne", "niriWidthOne", 100), 10);
            this.config.general.niriWidthTwo = parseInt(getVal("niriWidthTwo", "niriWidthTwo", 50), 10);
            this.config.general.niriWidthThree = parseInt(getVal("niriWidthThree", "niriWidthThree", 40), 10);

            const defIgnoreClasses = "kscreenlocker,sddm,greeter,lockscreen,krunner,yakuake,spectacle,plasmashell,ksmserver,kded5,org.kde.kscreenlocker_greet,org.kde.plasmashell,pavucontrol,org.kde.polkit-kde-authentication-agent-1,org.kde.kdialog,org.kde.direktor.tray";
            const defIgnoreTitles = "Desktop — Plasma,Desktop,Screen Locker,Login Screen,Greeter,Open File,Save File,Authentication";

            const rawRegex = getVal("useRegexOverrides", "useRegexOverrides", true);
            let rawIgnoreClasses = getVal("ignoreClasses", "ignoreClasses", defIgnoreClasses);
            let rawIgnoreTitles = getVal("ignoreTitles", "ignoreTitles", defIgnoreTitles);

            // If user has actively toggled rules via shortcut during this session and this is not a forced reload from GUI, preserve the session toggled lists
            if (!force && this._userToggledRules && this.config.rulesConfig) {
                rawIgnoreClasses = this.config.rulesConfig.ignoreClasses;
                rawIgnoreTitles = this.config.rulesConfig.ignoreTitles;
            } else {
                if (this.config.rulesConfig && this.config.rulesConfig.ignoreClasses && (!rawIgnoreClasses || rawIgnoreClasses === defIgnoreClasses)) {
                    rawIgnoreClasses = this.config.rulesConfig.ignoreClasses;
                }
                if (this.config.rulesConfig && this.config.rulesConfig.ignoreTitles && (!rawIgnoreTitles || rawIgnoreTitles === defIgnoreTitles)) {
                    rawIgnoreTitles = this.config.rulesConfig.ignoreTitles;
                }
            }

            const useRegex = rawRegex === true || rawRegex === "true" || rawRegex === 1 || rawRegex === "1";
            const newIgnoreClasses = String(rawIgnoreClasses);
            const newIgnoreTitles = String(rawIgnoreTitles);

            const oldIgnoreClasses = this.config.rulesConfig ? this.config.rulesConfig.ignoreClasses : "";
            const oldIgnoreTitles = this.config.rulesConfig ? this.config.rulesConfig.ignoreTitles : "";
            const rulesChanged = (oldIgnoreClasses !== newIgnoreClasses || oldIgnoreTitles !== newIgnoreTitles);

            this.config.rulesConfig = {
                useRegexOverrides: useRegex,
                ignoreClasses: newIgnoreClasses,
                ignoreTitles: newIgnoreTitles
            };

            const rawCustomShortcuts = KWin.readConfig("customShortcuts", typeof options !== "undefined" && typeof options.customShortcuts !== "undefined" ? options.customShortcuts : "");
            const parsedBindings = [];
            if (rawCustomShortcuts && typeof rawCustomShortcuts === "string") {
                const lines = rawCustomShortcuts.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith("#")) continue;
                    const parts = line.replace(/^bind\s*=\s*/i, "").split(",").map(s => s.trim()).filter(Boolean);
                    if (parts.length >= 2) {
                        const name = parts[0].replace(/^["']|["']$/g, "").trim();
                        let action = parts[1].replace(/^["']|["']$/g, "").trim();
                        const message = parts[2] ? parts[2].replace(/^["']|["']$/g, "").trim() : "";
                        if (action.toLowerCase() === "this.window.togglefloat") action = "toggle_floating";
                        if (action.toLowerCase() === "this.layout.cycle") action = "cycle_layout";
                        const id = "direktor_custom_" + name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                        parsedBindings.push({ id: id, name: "Direktor: " + name, action: action, message: message });
                    }
                }
            }
            this.config.customBindings = parsedBindings;

            this.notifyConfigChanged();
            return { changed: true, rulesChanged: rulesChanged };
        } catch (e) {
            print("[Direktor ConfigManager] Error reading KWin config: " + e);
        }
        return { changed: false, rulesChanged: false };
    }

    getRulesConfig() {
        this.reloadFromKWin(false);
        return this.config.rulesConfig || {
            useRegexOverrides: true,
            ignoreClasses: "kscreenlocker,sddm,greeter,lockscreen,krunner,yakuake,spectacle,plasmashell,ksmserver,kded5,org.kde.kscreenlocker_greet,org.kde.plasmashell,kcalc,pavucontrol,org.kde.polkit-kde-authentication-agent-1,org.kde.kdialog",
            ignoreTitles: "Desktop — Plasma,Desktop,Screen Locker,Login Screen,Greeter,Open File,Save File,Preferences,Settings,Authentication"
        };
    }

    onConfigChanged(callback) {
        this.onConfigChangedCallbacks.push(callback);
    }

    notifyConfigChanged() {
        for (const cb of this.onConfigChangedCallbacks) {
            try {
                cb(this.config);
            } catch (e) {
                print(`[Direktor ConfigManager] Callback error: ${e}`);
            }
        }
    }
}
