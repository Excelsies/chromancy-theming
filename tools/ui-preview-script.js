// Automation script for tools/ui-preview.sh: opens real apps and the main shell views in a headless
// shell and saves screenshots to $CHROMANCY_SHOT_DIR, named with $CHROMANCY_SHOT_PREFIX.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, sleep, waitFor } from '../tests/shell/lib/harness.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area');
const OUT = GLib.getenv('CHROMANCY_SHOT_DIR');
const PREFIX = GLib.getenv('CHROMANCY_SHOT_PREFIX') ?? '';
const APPS = ['org.gnome.Settings', 'org.gnome.Nautilus', 'org.gnome.TextEditor', 'org.gnome.Calculator',
    'org.gnome.DiskUtility', 'org.gnome.seahorse.Application'];

async function shoot(name, x, y, w, h) {
    x = Math.max(0, Math.round(x));
    y = Math.max(0, Math.round(y));
    w = Math.min(global.screen_width - x, Math.round(w));
    h = Math.min(global.screen_height - y, Math.round(h));
    const stream = Gio.File.new_for_path(`${OUT}/${PREFIX}${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Shell.Screenshot().screenshot_area(x, y, w, h, stream);
    stream.close(null);
    console.log(`# screenshot ${PREFIX}${name}.png ${w}x${h}`);
}

export async function run() {
    const t = new Suite();
    Main.overview.hide();
    await waitFor(() => !Main.overview.visible, 3000);

    for (const id of APPS) {
        const app = Shell.AppSystem.get_default().lookup_app(`${id}.desktop`);
        if (!app) {
            console.log(`# ${id}: not installed`);
            continue;
        }
        app.activate();
        const ok = await waitFor(() => app.get_windows()[0]?.get_frame_rect().width > 0, 20000);
        t.check(`${id} opens a window`, ok);
        if (!ok)
            continue;
        await sleep(2500);
        const win = app.get_windows()[0];
        const r = win.get_frame_rect();
        await shoot(id.split('.').pop().toLowerCase(), r.x, r.y, r.width, r.height);
        for (const w of app.get_windows())
            w.delete(global.get_current_time());
        await waitFor(() => app.get_windows().length === 0, 5000);
    }

    Main.overview.show();
    await waitFor(() => Main.overview.visible && !Main.overview.animationInProgress, 5000);
    await sleep(800);
    await shoot('overview', 0, 0, global.screen_width, global.screen_height);
    Main.overview.showApps();
    // ControlsState.APP_GRID is 2.
    await waitFor(() => Main.overview._overview.controls._stateAdjustment.value === 2, 5000);
    await sleep(800);
    await shoot('app-grid', 0, 0, global.screen_width, global.screen_height);
    Main.overview.hide();
    await waitFor(() => !Main.overview.visible, 3000);

    Main.notify('Chromancy Theming', 'A notification drawn with the palette.');
    await sleep(1500);
    await shoot('notification', global.screen_width / 2 - 300, 0, 600, 160);

    Main.osdWindowManager.showAll(new Gio.ThemedIcon({ name: 'audio-volume-high-symbolic' }), 'Volume', 0.6, 1);
    await sleep(800);
    await shoot('osd', global.screen_width / 2 - 250, global.screen_height - 260, 500, 260);
    t.finish();
}
