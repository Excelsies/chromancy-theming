// PickWindow: a click on a window returns its app; Esc, a second pick, the timeout and a click on no
// window are reported; the D-Bus method works the same way.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, sleep, waitFor, clickAt, pressKeys } from './lib/harness.js';

const APP_ID = 'io.github.excelsies.ChromancyTheming.TestWindow.desktop';

async function outcome(promise) {
    try {
        return { value: await promise };
    } catch (e) {
        return { code: e.code ?? e.message };
    }
}

export async function run() {
    const t = new Suite();
    const ext = extension().stateObj;
    const app = Shell.AppSystem.get_default().lookup_app(APP_ID);
    t.check('the fixture app is installed in the sandbox', app !== null);
    app.activate();
    // The window is listed before the compositor has given it a size.
    t.check('its window opens', await waitFor(() => app.get_windows()[0]?.get_frame_rect().width > 0, 15000));
    const win = app.get_windows()[0];
    const r = win.get_frame_rect();
    const [cx, cy] = [r.x + r.width / 2, r.y + r.height / 2];

    let p = outcome(ext.picker.pick());
    await sleep(200);
    await clickAt(cx, cy);
    t.equal('a click on the window returns its app', await p, { value: { id: APP_ID, name: 'Chromancy Test Window' } });
    t.check('the pick ends', !ext.picker.picking);

    p = outcome(ext.picker.pick());
    t.equal('a second pick while one runs is refused', (await outcome(ext.picker.pick())).code, 'busy');
    await pressKeys(Clutter.KEY_Escape);
    t.equal('Esc cancels', (await p).code, 'cancelled');

    p = outcome(ext.picker.pick());
    await sleep(200);
    const empty = r.x > 100 ? [20, global.stage.height - 20] : [global.stage.width - 20, global.stage.height - 20];
    await clickAt(...empty);
    t.equal('a click where there is no window is reported', (await p).code, 'no-app');

    const { Picker } = await import(`file://${GLib.getenv('CHROMANCY_TEST_ROOT')}/extension/picker.js`);
    t.equal('the pick times out', (await outcome(new Picker({ timeoutS: 1 }).pick())).code, 'timeout');

    const call = new Promise((resolve, reject) => Gio.DBus.session.call('org.gnome.Shell',
        '/io/github/excelsies/ChromancyTheming/Shell', 'io.github.excelsies.ChromancyTheming.Shell', 'PickWindow', null,
        new GLib.VariantType('(ss)'), Gio.DBusCallFlags.NONE, 10000, null, (conn, res) => {
            try {
                resolve(conn.call_finish(res).deepUnpack());
            } catch (e) {
                reject(e);
            }
        }));
    await waitFor(() => ext.picker.picking, 3000);
    await clickAt(cx, cy);
    t.equal('PickWindow over D-Bus returns the app', await call.catch(e => e.message), [APP_ID, 'Chromancy Test Window']);

    const cancelled = new Promise(resolve => Gio.DBus.session.call('org.gnome.Shell',
        '/io/github/excelsies/ChromancyTheming/Shell', 'io.github.excelsies.ChromancyTheming.Shell', 'PickWindow', null,
        new GLib.VariantType('(ss)'), Gio.DBusCallFlags.NONE, 10000, null, (conn, res) => {
            try {
                resolve(conn.call_finish(res));
            } catch (e) {
                resolve(Gio.DBusError.get_remote_error(e));
            }
        }));
    await waitFor(() => ext.picker.picking, 3000);
    await pressKeys(Clutter.KEY_Escape);
    t.equal('a cancelled pick is a named D-Bus error', await cancelled, 'io.github.excelsies.ChromancyTheming.Error.Cancelled');

    // A pick whose setup fails must not leave the screen grabbed or an overlay behind.
    const children = Main.uiGroup.get_n_children();
    const failing = new Picker({ pushModal: () => {
        throw new Error('injected grab failure');
    } });
    const failed = await outcome(failing.pick());
    t.equal('a failed setup rejects the pick', failed.code, 'injected grab failure');
    t.check('and leaves no pick running', !failing.picking);
    t.equal('no grab is left behind', Main.modalCount, 0);
    t.equal('no overlay is left behind', Main.uiGroup.get_n_children(), children);

    win.delete(global.get_current_time());
    t.finish();
}
