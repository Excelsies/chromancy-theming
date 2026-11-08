// Automation script for tools/ui-preview.sh: opens real apps and the main shell views in a headless
// shell and saves screenshots to $CHROMANCY_SHOT_DIR, named with $CHROMANCY_SHOT_PREFIX.
// $CHROMANCY_PREVIEW_APPS (comma-separated app ids) limits the apps; Chromancy Theming itself is captured
// when its launcher is installed in the sandbox (tools/screenshots.sh does that).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, sleep, waitFor } from '../tests/shell/lib/harness.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area');
const OUT = GLib.getenv('CHROMANCY_SHOT_DIR');
const PREFIX = GLib.getenv('CHROMANCY_SHOT_PREFIX') ?? '';
const SAMPLE = `${GLib.get_home_dir()}/example.js`;
/**
 * [app id, screenshot name, command line arguments]. Settings opens on Appearance, a page with nothing
 * personal; with a panel id it does not know it falls back to Wi-Fi, which lists nearby networks.
 */
const APPS = [
    ['io.github.excelsies.ChromancyTheming', 'chromancy', []],
    ['org.gnome.Settings', 'settings', ['background']],
    ['org.gnome.Nautilus', 'files', []],
    ['org.gnome.TextEditor', 'text-editor', [SAMPLE]],
    ['org.gnome.Calculator', 'calculator', []],
    ['org.gnome.seahorse.Application', 'passwords', []],
    ['org.gnome.DiskUtility', 'disks', []],
    ['qt6ct', 'qt6ct', []],
    ['org.gnome.Ptyxis', 'terminal', []],
];
const ONLY = GLib.getenv('CHROMANCY_PREVIEW_APPS')?.split(',');

GLib.file_set_contents(SAMPLE, `// A sample file, to show the editor's colors.
import { readFile } from 'node:fs/promises';

const GREETING = 'Hello';
const count = 42;

/** Says hello to everyone in the list. */
export async function greet(path) {
    const names = JSON.parse(await readFile(path, 'utf8'));
    for (const name of names)
        console.log(\`\${GREETING}, \${name}!\`, count > 40 ? true : null);
}
`);

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

async function shootActor(name, actor, pad = 24) {
    await waitFor(() => actor.mapped && actor.get_transformed_extents().get_width() > 0, 3000);
    await sleep(500);
    const r = actor.get_transformed_extents();
    await shoot(name, r.get_x() - pad, r.get_y() - pad, r.get_width() + 2 * pad, r.get_height() + 2 * pad);
}

/** Starts an app with arguments, through the shell's launch context as the dock or grid would. */
function launch(desktopId, args) {
    const info = Gio.DesktopAppInfo.new(desktopId);
    const command = info.get_commandline().replace(/\s%[fFuUik]/g, '');
    const app = Gio.AppInfo.create_from_commandline(`${command} ${args.map(a => GLib.shell_quote(a)).join(' ')}`.trim(),
        null, Gio.AppInfoCreateFlags.NONE);
    app.launch([], global.create_app_launch_context(0, -1));
}

export async function run() {
    const t = new Suite();
    Main.overview.hide();
    await waitFor(() => !Main.overview.visible, 3000);

    const quick = Main.panel.statusArea.quickSettings.menu;
    quick.open(false);
    await shootActor('quick-settings', quick.box);
    quick.close(false);
    const date = Main.panel.statusArea.dateMenu.menu;
    date.open(false);
    await shootActor('calendar', date.box);
    date.close(false);
    await sleep(300);
    await shoot('panel', 0, 0, global.screen_width, Main.panel.height);

    for (const [id, name, args] of APPS) {
        if (ONLY && !ONLY.includes(id))
            continue;
        const app = Shell.AppSystem.get_default().lookup_app(`${id}.desktop`);
        if (!app) {
            console.log(`# ${id}: not installed`);
            continue;
        }
        if (args.length)
            launch(`${id}.desktop`, args);
        else
            app.activate();
        const ok = await waitFor(() => app.get_windows()[0]?.get_frame_rect().width > 0, 20000);
        t.check(`${id} opens a window`, ok);
        if (!ok)
            continue;
        await sleep(2500);
        const r = app.get_windows()[0].get_frame_rect();
        await shoot(name, r.x, r.y, r.width, r.height);
        for (const w of app.get_windows())
            w.delete(global.get_current_time());
        await waitFor(() => app.get_windows().length === 0, 5000);
    }

    Main.overview.show();
    await waitFor(() => Main.overview.visible && !Main.overview.animationInProgress, 5000);
    await sleep(800);
    await shoot('overview', 0, 0, global.screen_width, global.screen_height);
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
