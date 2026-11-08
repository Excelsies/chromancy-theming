// Automation script for tools/shell-preview.sh: opens the quick settings and the calendar in a headless
// shell and saves screenshots to $CHROMANCY_SHOT_DIR.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, sleep, waitFor } from '../tests/shell/lib/harness.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area');
const OUT = GLib.getenv('CHROMANCY_SHOT_DIR');
const PREFIX = GLib.getenv('CHROMANCY_SHOT_PREFIX') ?? '';

async function capture(name, actor, pad = 24) {
    await sleep(500);
    const r = actor.get_transformed_extents();
    const x = Math.max(0, Math.round(r.get_x() - pad));
    const y = Math.max(0, Math.round(r.get_y() - pad));
    const w = Math.min(global.screen_width - x, Math.round(r.get_width() + 2 * pad));
    const h = Math.min(global.screen_height - y, Math.round(r.get_height() + 2 * pad));
    const stream = Gio.File.new_for_path(`${OUT}/${PREFIX}${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Shell.Screenshot().screenshot_area(x, y, w, h, stream);
    stream.close(null);
    console.log(`# screenshot ${PREFIX}${name}.png ${w}x${h}`);
}

export async function run() {
    const t = new Suite();
    const ext = extension().stateObj;
    if (GLib.getenv('CHROMANCY_PREVIEW_CSS'))
        t.check('the stylesheet is loaded', await waitFor(() => ext.shellTheme.active, 5000));
    Main.overview.hide();
    await waitFor(() => !Main.overview.visible, 3000);

    const quick = Main.panel.statusArea.quickSettings.menu;
    quick.open(false);
    await waitFor(() => quick.box.mapped && quick.box.get_transformed_extents().get_width() > 0, 3000);
    await capture('quick-settings', quick.box);
    quick.close(false);

    const date = Main.panel.statusArea.dateMenu.menu;
    date.open(false);
    await waitFor(() => date.box.mapped && date.box.get_transformed_extents().get_width() > 0, 3000);
    await capture('calendar', date.box);
    date.close(false);

    await capture('panel', Main.panel, 0);
    t.finish();
}
