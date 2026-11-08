// A real GTK 3 app on the installed Yaru theme draws the palette's colors once the gtk3 target's
// files are in place (Yaru rebuilt with the palette), and Yaru's own colors without the import line.
// Run by tools/display-test.sh; needs sassc and the Yaru-purple-dark theme.
import GLib from 'gi://GLib';
import { parsePalette } from '../../lib/palette.js';
import { resolvePalette } from '../../lib/derive.js';
import { gtk3 } from '../../lib/targets/gtk3.js';
import { withLine } from '../../lib/applier.js';
import { buildGtk3 } from '../../app/yaruBuild.js';
import { contrast } from '../../lib/color.js';

const THEME = 'Yaru-purple-dark';
const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const root = GLib.canonicalize_filename(`${here}/../..`, null);
const tmp = GLib.getenv('CHROMANCY_TEST_TMP');
if (!tmp || GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('run through tools/display-test.sh');
    imports.system.exit(2);
}
if (!GLib.file_test(`/usr/share/themes/${THEME}/gtk-3.0/gtk.gresource`, GLib.FileTest.EXISTS)) {
    print(`SKIP: ${THEME} is not installed`);
    imports.system.exit(0);
}
const read = p => new TextDecoder().decode(GLib.file_get_contents(p)[1]);
const palette = resolvePalette(parsePalette('jeweltone-dark', JSON.parse(read(`${root}/data/palettes/jeweltone-dark.json`))));
const built = await buildGtk3(palette, { vendorDir: `${root}/vendor/yaru`, workDir: `${tmp}/build`, gtkTheme: THEME });

function draw(mode) {
    const config = `${tmp}/${mode}/config`;
    const data = `${tmp}/${mode}/data`;
    GLib.mkdir_with_parents(`${config}/gtk-3.0`, 0o700);
    for (const op of gtk3.plan(palette, { paths: { config, data }, gtkTheme: THEME }, built)) {
        GLib.mkdir_with_parents(GLib.path_get_dirname(op.path), 0o700);
        if (op.kind === 'file' && op.encoding === 'base64')
            GLib.file_set_contents(op.path, GLib.base64_decode(op.content));
        else if (op.kind === 'file')
            GLib.file_set_contents(op.path, op.content);
        else if (mode === 'applied')
            GLib.file_set_contents(op.path, withLine('', op.line));
    }
    let env = GLib.environ_setenv(GLib.get_environ(), 'XDG_CONFIG_HOME', config, true);
    env = GLib.environ_setenv(env, 'GTK_THEME', THEME, true);
    const [, out, err, status] = GLib.spawn_sync(null, ['gjs', '-m', `${here}/gtk3-app.js`], env, GLib.SpawnFlags.SEARCH_PATH, null);
    if (status !== 0)
        throw new Error(`probe app failed: ${new TextDecoder().decode(err)}`);
    return JSON.parse(new TextDecoder().decode(out).trim().split('\n').pop());
}

let failures = 0;
const check = (ok, what) => {
    print(`${ok ? 'ok' : 'FAIL'}: ${what}`);
    if (!ok)
        failures++;
};
const control = draw('control');
const applied = draw('applied');
const c = palette.colors;
check(applied.text === c['on-surface'], `GTK 3 label text is on-surface ${c['on-surface']} (got ${applied.text}, Yaru's ${control.text})`);
check(applied.windowBg === c.surface, `GTK 3 window background is surface ${c.surface} (got ${applied.windowBg}, Yaru's ${control.windowBg})`);
// The headless window is unfocused, so buttons draw their dimmed (backdrop) text; it must still be
// readable on the accent, which Yaru's white is not on a light accent.
const ratio = contrast(applied.suggested, c.primary);
check(ratio >= 3, `GTK 3 suggested button text ${applied.suggested} reads on primary ${c.primary} (${ratio.toFixed(2)}:1, Yaru's white would be ${contrast('#f9f2e4', c.primary).toFixed(2)}:1)`);
check(control.text !== applied.text && control.windowBg !== applied.windowBg, 'the control run draws Yaru\'s own colors');
if (failures)
    imports.system.exit(1);
