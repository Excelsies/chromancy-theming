// Loads the shell stylesheet Chromancy builds (~/.local/share/chromancy-theming/shell/gnome-shell.css)
// as the shell's theme stylesheet, above the session's own theme, and follows it: a rewrite reloads it,
// a removal returns to the stylesheet that was set before. A stylesheet St cannot parse is not loaded;
// the one already shown stays.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const DEBOUNCE_MS = 250;

export class ShellTheme {
    /** @param {{path: string, log: (msg: string) => void}} opts */
    constructor({ path, log }) {
        this._path = path;
        this._log = log;
        this._file = Gio.File.new_for_path(path);
        this._active = false;
        this._previous = null;
        this._monitor = null;
        this._timer = 0;
    }

    start() {
        const dir = this._file.get_parent();
        try {
            dir.make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                this._log(`cannot create ${dir.get_path()}: ${e.message}`);
        }
        try {
            this._monitor = dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            this._monitor.connect('changed', (_m, file, other) => {
                if (file?.equal(this._file) || other?.equal(this._file))
                    this._schedule();
            });
        } catch (e) {
            this._log(`cannot watch ${dir.get_path()}: ${e.message}`);
        }
        this._load();
    }

    stop() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        this._monitor?.cancel();
        this._monitor = null;
        if (this._active)
            this._unload();
    }

    get active() {
        return this._active;
    }

    _schedule() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._timer = 0;
            this._load();
            return GLib.SOURCE_REMOVE;
        });
    }

    _load() {
        if (!this._file.query_exists(null)) {
            if (this._active)
                this._unload();
            return;
        }
        try {
            new St.Theme().load_stylesheet(this._file);
        } catch (e) {
            this._log(`not loading ${this._path}: ${e.message}`);
            return;
        }
        if (!this._active) {
            const current = Main.getThemeStylesheet();
            this._previous = current ? current.get_path() : null;
        }
        Main.setThemeStylesheet(this._path);
        Main.loadTheme();
        this._active = true;
    }

    _unload() {
        Main.setThemeStylesheet(this._previous);
        Main.loadTheme();
        this._active = false;
        this._previous = null;
    }
}
