// A real libadwaita app, started in a headless compositor, draws the palette's colors once the
// gtk4 target's files are in place, and Ubuntu's own colors without the import line (the control
// run that shows the check can tell the two apart). Run by tools/display-test.sh.
import GLib from 'gi://GLib';
import { parsePalette } from '../../lib/palette.js';
import { resolvePalette } from '../../lib/derive.js';
import { gtk4 } from '../../lib/targets/gtk4.js';
import { withLine } from '../../lib/applier.js';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const tmp = GLib.getenv('CHROMANCY_TEST_TMP');
if (!tmp || GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('run through tools/display-test.sh');
    imports.system.exit(2);
}
const read = p => new TextDecoder().decode(GLib.file_get_contents(p)[1]);
const palette = resolvePalette(parsePalette('jeweltone-dark',
    JSON.parse(read(`${here}/../../data/palettes/jeweltone-dark.json`))));

/** Starts the probe app with a config dir prepared for `mode` and returns the colors it drew. */
function draw(mode) {
    const config = `${tmp}/${mode}/config`;
    GLib.mkdir_with_parents(`${config}/gtk-4.0`, 0o700);
    for (const op of gtk4.plan(palette, { paths: { config } })) {
        if (op.kind === 'file')
            GLib.file_set_contents(op.path, op.content);
        else if (mode !== 'control')
            GLib.file_set_contents(op.path, withLine('window.user-rule { }\n', op.line));
    }
    const env = GLib.environ_setenv(GLib.get_environ(), 'XDG_CONFIG_HOME', config, true);
    // A blacklisted app starts through the wrapper, which hides Chromancy's stylesheet from it.
    const wrapper = mode === 'blacklisted' ? [`${here}/../../bin/chromancy-theming-unthemed`] : [];
    const [, out, err, status] = GLib.spawn_sync(null, [...wrapper, 'gjs', '-m', `${here}/gtk4-app.js`], env,
        GLib.SpawnFlags.SEARCH_PATH, null);
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
check(applied.text === palette.colors['on-surface'], `window text is on-surface ${palette.colors['on-surface']} (got ${applied.text})`);
check(applied.suggested === palette.colors['on-primary'], `text on a suggested button is on-primary (got ${applied.suggested})`);
check(applied.accent !== control.accent, `accent text follows the palette (got ${applied.accent}, Ubuntu's ${control.accent})`);
check(control.text !== palette.colors['on-surface'], `control run without the import line draws other colors (got ${control.text})`);
check(control.suggested !== palette.colors['on-primary'], `control run suggested text differs (got ${control.suggested})`);
const blacklisted = draw('blacklisted');
check(JSON.stringify(blacklisted) === JSON.stringify(control),
    `started through the blacklist wrapper, the app draws Ubuntu's colors like the control run (${JSON.stringify(blacklisted)})`);

if (failures)
    imports.system.exit(1);
