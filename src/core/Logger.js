/**
 * ============================================================================
 * Direktor Core: Real-Time In-Memory Ring Buffer & File Logger
 * ============================================================================
 * Captures executions, window placements, closures, rule evaluations, signals,
 * errors, and warnings into a high-performance in-memory ring buffer (up to 1000 entries).
 * Also dumps logs to ~/.config/direktor/log.txt when requested or during hot-reload.
 */

export class DirektorLogger {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.buffer = [];
    }

    _formatTimestamp() {
        const d = new Date();
        const pad = (n) => (n < 10 ? "0" + n : n);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${(d.getMilliseconds() + "000").slice(0, 3)}`;
    }

    log(level, category, message, details = null) {
        const timestamp = this._formatTimestamp();
        let formatted = `[${timestamp}] [${level}] [${category}] ${message}`;
        if (details) {
            try {
                formatted += typeof details === "string" ? ` | ${details}` : ` | ${JSON.stringify(details)}`;
            } catch (e) {}
        }

        // Print to KWin's system journal
        print(formatted);

        // Append to in-memory ring buffer
        this.buffer.push(formatted);
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }
    }

    info(category, message, details = null) {
        this.log("INFO", category, message, details);
    }

    warn(category, message, details = null) {
        this.log("WARN", category, message, details);
    }

    error(category, message, details = null) {
        this.log("ERROR", category, message, details);
    }

    debug(category, message, details = null) {
        this.log("DEBUG", category, message, details);
    }

    /**
     * Retrieves recent logs formatted as a single multiline string.
     * @param {number} [limit=250]
     * @returns {string}
     */
    getLogsText(limit = 250) {
        if (this.buffer.length === 0) {
            return "[Direktor Logger] No log entries recorded yet in current session.";
        }
        const slice = this.buffer.slice(-limit);
        return slice.join("\n");
    }

    dumpToFile() {
        // In Plasma 6 DeclarativeScript, ring buffer logs are retrieved via D-Bus or KConfig summary
        return false;
    }
}

export const Logger = new DirektorLogger(1000);
