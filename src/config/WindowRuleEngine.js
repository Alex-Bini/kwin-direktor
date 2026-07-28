/**
 * ============================================================================
 * Direktor: Window Rule Engine
 * ============================================================================
 * Evaluates application windows against the JSON rules matrix to decide
 * tiling vs. floating vs. ignoring.
 */

export class WindowRuleEngine {
    /**
     * @param {ConfigManager} configManager
     */
    constructor(configManager) {
        this.configManager = configManager;
    }

    /**
     * Evaluates a KWin window and returns the action to take.
     * @param {KWin.Window} window
     * @returns {"tile" | "float" | "ignore"}
     */
    evaluateWindow(window) {
        if (!window) return "ignore";

        if (typeof this.configManager.reloadFromKWin === "function") {
            this.configManager.reloadFromKWin(false);
        }

        // Built-in safety checks from Krohnkite & Karousel: skip non-normal, special, unmanaged, internal (pid <= 0), popups, lock/splash, dock, and full-screen geometries
        if (!window || !window.normalWindow || window.specialWindow || window.splash || window.lockScreen || window.onScreenDisplay || window.popupWindow || window.dock) {
            return "ignore";
        }
        if (typeof window.managed !== "undefined" && !window.managed) {
            return "ignore";
        }
        // In KWin integer enum Workspace::Layer, 2 is NormalLayer (0=Desktop, 10=Screenlocker, etc.). Skip any non-normal layer immediately.
        if (typeof window.layer === "number" && window.layer !== 2) {
            return "ignore";
        }
        if (typeof window.pid === "number" && window.pid <= 0 && !window.resourceClass) {
            return "ignore";
        }
        // If a window starts full-screen or covers the full screen area right on creation (e.g. lock screens, SDDM greeters, games), ignore immediately
        if (window.fullScreen) {
            return "ignore";
        }

        const cls = [
            window.resourceClass || "",
            window.resourceName || "",
            window.desktopFileName || "",
            window.appId || ""
        ].filter(Boolean).join(" ");
        const role = String(window.windowRole || window.windowType || "");
        const caption = String(window.caption || "");
        const fullIdentity = `${cls} ${role} ${caption}`.trim();

        // Comprehensive lockscreen and safety ignores
        if (/kscreenlocker|sddm|greeter|lock.*screen|screen.*lock|krunner|yakuake|spectacle|ksmserver|plasmashell|xwaylandvideobridge|polkit/i.test(fullIdentity)) {
            return "ignore";
        }

        // Configurable User Overrides from KWin UI (Binary Karousel-style Override: Ignore vs Tile)
        const rulesConfig = typeof this.configManager.getRulesConfig === "function" ? this.configManager.getRulesConfig() : null;
        if (rulesConfig) {
            const useRegex = !!rulesConfig.useRegexOverrides;
            if (this.matchesConfigList(fullIdentity, rulesConfig.ignoreClasses, useRegex) ||
                this.matchesConfigList(caption, rulesConfig.ignoreTitles, useRegex)) {
                console.log(`[Direktor RuleEngine] evaluateWindow: caption="${caption}", class="${window.resourceClass || ''}" -> IGNORE via rulesConfig.ignoreClasses/Titles`);
                return "ignore";
            }
        }

        const rules = this.configManager.getRules();
        for (const rule of rules) {
            if (this.matchesRule(window, rule.match)) {
                const action = rule.action || "tile";
                console.log(`[Direktor RuleEngine] evaluateWindow: caption="${caption}" -> ${action.toUpperCase()} via JSON rules`);
                return action;
            }
        }

        // By default, only true modal or transient child dialogs float; normal app windows tile
        if (window.modal || (window.dialog && window.transient)) {
            console.log(`[Direktor RuleEngine] evaluateWindow: caption="${caption}" -> FLOAT (modal/transient dialog)`);
            return "float";
        }

        console.log(`[Direktor RuleEngine] evaluateWindow: caption="${caption}", class="${window.resourceClass || ''}", fullIdentity="${fullIdentity}" -> TILE (default). ignoreClasses="${rulesConfig ? rulesConfig.ignoreClasses : 'null'}"`);
        return "tile";
    }

    matchesConfigList(value, configString, useRegex) {
        if (!value || !configString) return false;
        const strVal = String(value).trim();
        if (!strVal) return false;

        const items = String(configString).split(",").map(s => s.trim()).filter(Boolean);
        for (const item of items) {
            if (useRegex) {
                try {
                    const pattern = new RegExp(item, "i");
                    if (pattern.test(strVal)) return true;
                } catch (e) {
                    if (strVal.toLowerCase().includes(item.toLowerCase())) return true;
                }
            } else {
                if (strVal.toLowerCase() === item.toLowerCase() || strVal.toLowerCase().includes(item.toLowerCase())) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Checks whether a window matches a JSON rule filter object.
     * Supports exact string match or regex matching for resourceClass/caption.
     * @param {KWin.Window} window
     * @param {Object} matchFilter
     */
    matchesRule(window, matchFilter) {
        if (!matchFilter) return false;

        if (matchFilter.resourceClass) {
            const pattern = new RegExp(matchFilter.resourceClass, "i");
            if (!pattern.test(window.resourceClass || "")) {
                return false;
            }
        }

        if (matchFilter.caption) {
            const pattern = new RegExp(matchFilter.caption, "i");
            if (!pattern.test(window.caption || "")) {
                return false;
            }
        }

        if (typeof matchFilter.dialog === "boolean") {
            if (window.dialog !== matchFilter.dialog) {
                return false;
            }
        }

        return true;
    }
}
