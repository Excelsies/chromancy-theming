// Lets the user point at a window: a crosshair, the window under the pointer outlined, a click picks
// it and Esc or the timeout cancels. Resolves to the window's app (desktop file id and name).

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const PICK_TIMEOUT_S = 30;

export class PickError extends Error {
    /** @param {'busy' | 'cancelled' | 'timeout' | 'no-app'} code */
    constructor(code, message) {
        super(message);
        this.name = 'PickError';
        this.code = code;
    }
}

const PICKABLE = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG, Meta.WindowType.UTILITY];

/** The topmost pickable window at stage coordinates, or null. */
export function windowAt(x, y) {
    const actors = global.get_window_actors().slice().reverse();
    for (const actor of actors) {
        const win = actor.get_meta_window();
        if (!win || win.minimized || !win.showing_on_its_workspace() || !PICKABLE.includes(win.get_window_type()))
            continue;
        const r = win.get_frame_rect();
        if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)
            return win;
    }
    return null;
}

export class Picker {
    /** @param {{timeoutS?: number, pushModal?: typeof Main.pushModal}} [opts] pushModal: replaced in tests */
    constructor({ timeoutS = PICK_TIMEOUT_S, pushModal = Main.pushModal } = {}) {
        this._timeoutS = timeoutS;
        this._pushModal = pushModal;
        this._session = null;
    }

    get picking() {
        return this._session !== null;
    }

    /** @returns {Promise<{id: string, name: string}>} */
    pick() {
        if (this._session)
            return Promise.reject(new PickError('busy', 'a pick is already in progress'));
        return new Promise((resolve, reject) => {
            const overlay = new St.Widget({ reactive: true, x: 0, y: 0, width: global.stage.width, height: global.stage.height });
            const outline = new St.Widget({ style: 'border: 3px solid #ffffff; background-color: rgba(255,255,255,0.12);', visible: false });
            overlay.add_child(outline);
            Main.uiGroup.add_child(overlay);
            const session = { overlay, grab: null, timer: 0 };
            this._session = session;

            // Releases everything the pick holds; safe to call at any point of the setup below.
            const finish = (err, value) => {
                if (this._session !== session)
                    return;
                this._session = null;
                if (session.timer)
                    GLib.source_remove(session.timer);
                if (session.grab)
                    Main.popModal(session.grab);
                overlay.destroy();
                if (err)
                    reject(err);
                else
                    resolve(value);
            };
            session.finish = finish;
            try {
                session.grab = this._pushModal(overlay, { actionMode: Shell.ActionMode.NORMAL });
                // The cursor belongs to the overlay, so it ends with it.
                overlay.set_cursor_type(Clutter.CursorType.CROSSHAIR);
            } catch (e) {
                finish(e);
                return;
            }

            const highlight = (x, y) => {
                const win = windowAt(x, y);
                if (!win) {
                    outline.hide();
                    return;
                }
                const r = win.get_frame_rect();
                outline.set_position(r.x, r.y);
                outline.set_size(r.width, r.height);
                outline.show();
            };
            overlay.connect('motion-event', (_a, event) => {
                highlight(...event.get_coords());
                return Clutter.EVENT_STOP;
            });
            overlay.connect('button-press-event', (_a, event) => {
                if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                    return Clutter.EVENT_STOP;
                const win = windowAt(...event.get_coords());
                const app = win ? Shell.WindowTracker.get_default().get_window_app(win) : null;
                if (!win)
                    finish(new PickError('no-app', 'no window there'));
                else if (!app || app.is_window_backed())
                    finish(new PickError('no-app', `the window "${win.get_title() ?? ''}" does not belong to an installed app`));
                else
                    finish(null, { id: app.get_id(), name: app.get_name() });
                return Clutter.EVENT_STOP;
            });
            overlay.connect('key-press-event', (_a, event) => {
                if (event.get_key_symbol() === Clutter.KEY_Escape)
                    finish(new PickError('cancelled', 'cancelled'));
                return Clutter.EVENT_STOP;
            });
            session.timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._timeoutS, () => {
                session.timer = 0;
                finish(new PickError('timeout', `no window picked within ${this._timeoutS} s`));
                return GLib.SOURCE_REMOVE;
            });
            const [x, y] = global.get_pointer();
            highlight(x, y);
        });
    }

    /** Cancels a pick in progress (the extension is being disabled). */
    cancel() {
        this._session?.finish(new PickError('cancelled', 'the extension was disabled'));
    }
}
