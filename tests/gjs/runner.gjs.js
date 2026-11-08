// The runner end to end on real files: apply a built-in palette to every target in a temporary home,
// check what landed, switch palettes, restore. Settings are on the in-memory backend.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { applyPalette, defaultContext, loadPalettes, restoreTargets } from '../../app/runner.js';
import { LINE_MARKER } from '../../lib/applier.js';

if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('refusing to run: set GSETTINGS_BACKEND=memory');
    imports.system.exit(2);
}
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 120, () => {
    printerr('FAIL: still running after 120 s');
    imports.system.exit(1);
});

const tmp = GLib.dir_make_tmp('chromancy-runner-XXXXXX');
const ctx = { ...defaultContext({ config: `${tmp}/config`, data: `${tmp}/data`, state: `${tmp}/state` }), gtkTheme: 'Yaru-purple-dark' };
const read = p => (GLib.file_test(p, GLib.FileTest.EXISTS) ? new TextDecoder().decode(GLib.file_get_contents(p)[1]) : null);
const iface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
// The desktop targets; the app and integration targets have their own test (targets.gjs.js).
const all = ['style', 'gtk4', 'gtk3', 'shell', 'fonts'];

const lines = [];
let failures = 0;
const check = (ok, what) => {
    lines.push(`${ok ? 'ok' : 'FAIL'}: ${what}`);
    if (!ok)
        failures++;
};

GLib.mkdir_with_parents(`${ctx.paths.config}/gtk-4.0`, 0o700);
GLib.file_set_contents(`${ctx.paths.config}/gtk-4.0/gtk.css`, '/* mine */\n');
GLib.mkdir_with_parents(ctx.userPalettes, 0o700);
GLib.file_set_contents(`${ctx.userPalettes}/broken.json`, '{"name": "Broken", "colors": {}}');

const { palettes, errors } = loadPalettes(ctx);
check(palettes.size === 22, `22 built-in palettes load (got ${palettes.size})`);
check(errors.length === 1 && /colors\.primary/.test(errors[0].error), `a broken user palette is reported with its key (${JSON.stringify(errors)})`);

const dark = palettes.get('jeweltone-dark');
let r = await applyPalette(dark, all, ctx);
const statuses = r.results.map(x => `${x.target}:${x.status}`);
check(r.results.every(x => x.status === 'applied'), `every operation applied (${statuses.join(', ')})`);
check(read(`${ctx.paths.config}/gtk-4.0/gtk.css`).startsWith('@import url("file://') && read(`${ctx.paths.config}/gtk-4.0/gtk.css`).endsWith(`${LINE_MARKER}\n/* mine */\n`),
    'gtk.css keeps the user content under the import line');
check(read(`${ctx.paths.config}/gtk-4.0/chromancy-theming.css`)?.includes('--accent-bg-color: #e3c078;'), 'GTK 4 stylesheet written');
check(read(`${ctx.paths.config}/gtk-3.0/chromancy-theming.css`)?.includes('Jeweltone Dark'), 'GTK 3 stylesheet written');
check(read(`${ctx.paths.data}/chromancy-theming/shell/gnome-shell.css`)?.includes('#e3c078'), 'shell stylesheet written');
check(iface.get_string('color-scheme') === 'prefer-dark', 'dark style set');

await applyPalette(palettes.get('jeweltone-light'), all, ctx);
check(iface.get_string('color-scheme') === 'default', 'switching to the light palette sets the light style');
check(read(`${ctx.paths.config}/gtk-4.0/chromancy-theming.css`).includes('--accent-bg-color: #7a5510;'), 'and rewrites the GTK 4 stylesheet');

// A target that fails to build keeps what it applied before.
const before = read(`${ctx.paths.config}/gtk-3.0/chromancy-theming.css`);
r = await applyPalette(dark, all, { ...ctx, vendorDir: `${tmp}/no-such-vendor` });
const gtk3 = r.results.filter(x => x.target === 'gtk3');
check(gtk3.length === 1 && gtk3[0].status === 'failed', `a failed GTK 3 build is one failed result (${JSON.stringify(gtk3)})`);
check(read(`${ctx.paths.config}/gtk-3.0/chromancy-theming.css`) === before, 'and the earlier GTK 3 stylesheet stays in place');
check(r.results.filter(x => x.target === 'gtk4').every(x => x.status !== 'failed'), 'other targets still apply');

// A GTK theme that is not Yaru fails GTK 3 only.
r = await applyPalette(dark, ['gtk3'], { ...ctx, gtkTheme: 'Adwaita' });
check(r.results.length === 1 && /not Yaru/.test(r.results[0].error), 'a non-Yaru GTK theme is reported for GTK 3');

r = await restoreTargets(undefined, ctx);
check(r.results.every(x => x.status !== 'failed'), `restore succeeds (${r.results.map(x => `${x.target}:${x.status}`).join(', ')})`);
check(read(`${ctx.paths.config}/gtk-4.0/gtk.css`) === '/* mine */\n', 'gtk.css is back to the user content');
check(read(`${ctx.paths.config}/gtk-4.0/chromancy-theming.css`) === null, 'the GTK 4 stylesheet is gone');
check(read(`${ctx.paths.config}/gtk-3.0/gtk.css`) === null, 'a gtk.css created only for the import is gone');
check(read(`${ctx.paths.data}/chromancy-theming/shell/gnome-shell.css`) === null, 'the shell stylesheet is gone');
check(iface.get_user_value('color-scheme') === null, 'the style setting is back to its default');

GLib.spawn_sync(null, ['rm', '-rf', tmp], null, GLib.SpawnFlags.SEARCH_PATH, null);
for (const l of lines)
    print(l);
if (failures)
    imports.system.exit(1);
