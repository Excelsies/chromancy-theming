// The Yaru rebuild. Built with Yaru's own values it must equal the installed Yaru-purple-dark GTK 3
// and Yaru dark shell stylesheets byte for byte (skipped when the installed Yaru is not the vendored
// version). Built with a palette, none of Yaru's purple or the runtime accent may remain.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import { buildGtk3, buildShell, sassc } from '../../app/yaruBuild.js';
import { parsePalette } from '../../lib/palette.js';
import { resolvePalette } from '../../lib/derive.js';
import { parseSource } from '../../lib/yaru.js';
import { contrast } from '../../lib/color.js';

// Budget: the 50 built-in palettes take about 1.8 s each to build (GTK 3 and shell), 90 s one at a time
// here and on CI. Four at a time, the whole test takes about 27 s here; 120 s catches a hang and leaves
// room for a slow runner.
const TIMEOUT_S = 120;
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TIMEOUT_S, () => {
    printerr(`FAIL: still running after ${TIMEOUT_S} s`);
    imports.system.exit(1);
});

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const root = GLib.canonicalize_filename(`${here}/../..`, null);
const vendorDir = `${root}/vendor/yaru`;
const decoder = new TextDecoder();
const read = p => decoder.decode(GLib.file_get_contents(p)[1]);
const spawn = argv => {
    const [, out, , status] = GLib.spawn_sync(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
    return status === 0 ? decoder.decode(out) : null;
};
const tmp = GLib.dir_make_tmp('chromancy-yaru-XXXXXX');
const YARU_PURPLE = '#7764d8';
const pixbuf = bytes => {
    const loader = GdkPixbuf.PixbufLoader.new();
    loader.write_bytes(bytes);
    loader.close();
    return loader.get_pixbuf().add_alpha(false, 0, 0, 0);
};
/** Mean absolute difference of opacity-weighted channels, 0-255. */
function meanDiff(a, b) {
    const pa = a.get_pixels(), pb = b.get_pixels();
    let sum = 0;
    for (let i = 0; i < pa.length; i += 4) {
        for (let k = 0; k < 3; k++)
            sum += Math.abs(pa[i + k] * pa[i + 3] - pb[i + k] * pb[i + 3]) / 255;
        sum += Math.abs(pa[i + 3] - pb[i + 3]);
    }
    return sum / pa.length;
}
/** Whether an image has opaque pixels close to a color (contrast under 1.1). */
function hasColor(b64, hex) {
    const p = pixbuf(new GLib.Bytes(GLib.base64_decode(b64))).get_pixels();
    for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] < 250)
            continue;
        const px = `#${[p[i], p[i + 1], p[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
        if (contrast(px, hex) < 1.1 && Math.max(...[0, 1, 2].map(k => Math.abs(p[i + k] - parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16)))) < 40)
            return true;
    }
    return false;
}
const work = name => {
    const d = `${tmp}/${name}`;
    GLib.mkdir_with_parents(d, 0o700);
    return d;
};

const results = [];
let failures = 0;
const check = (ok, what) => {
    results.push(`${ok ? 'ok' : 'FAIL'}: ${what}`);
    if (!ok)
        failures++;
};

if (!GLib.find_program_in_path('sassc')) {
    print('SKIP: sassc is not installed');
    imports.system.exit(0);
}

const vendored = parseSource(read(`${vendorDir}/SOURCE`)).version;
const installed = spawn(['dpkg-query', '-W', '-f=${Version}', 'yaru-theme-gtk']);
if (installed === vendored) {
    const gtk3 = await buildGtk3(null, { vendorDir, workDir: work('oracle-gtk3'), gtkTheme: 'Yaru-purple-dark' });
    // The accent images rendered with Yaru's own values match the installed ones (rsvg here, Inkscape in
    // Yaru's build: measured mean differences up to 1.74 of 255, opacity-weighted).
    const res = Gio.Resource.load('/usr/share/themes/Yaru-purple-dark/gtk-3.0/gtk.gresource');
    const worst = Object.entries(gtk3.assets).map(([file, b64]) => {
        const a = pixbuf(new GLib.Bytes(GLib.base64_decode(b64)));
        const b = pixbuf(res.lookup_data(`/com/ubuntu/themes/Yaru-purple-dark/3.0/assets/${file}`, 0));
        const same = a.get_width() === b.get_width() && a.get_height() === b.get_height();
        return { file, same, diff: same ? meanDiff(a, b) : Infinity };
    }).sort((x, y) => y.diff - x.diff)[0];
    check(hasColor(gtk3.assets['text-select-end-active.png'], YARU_PURPLE), 'calibration: the purple detector finds purple in Yaru\'s own image');
    check(Object.keys(gtk3.assets).length === 24 && worst.diff < 3,
        `the 24 accent images match the installed Yaru ones (worst ${worst.file}: ${worst.diff.toFixed(2)})`);
    const want3 = spawn(['gresource', 'extract', '/usr/share/themes/Yaru-purple-dark/gtk-3.0/gtk.gresource',
        '/com/ubuntu/themes/Yaru-purple-dark/3.0/gtk.css']);
    check(gtk3.css === want3, `GTK 3 rebuilt with Yaru's values equals installed Yaru-purple-dark (${gtk3.css.length} bytes)`);
    const shell = await buildShell(null, { vendorDir, workDir: work('oracle-shell') });
    const wantShell = spawn(['gresource', 'extract', '/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource',
        '/org/gnome/shell/theme/Yaru/gnome-shell-dark.css']);
    check(shell.css === wantShell, `shell rebuilt with Yaru's values equals installed Yaru dark (${shell.css.length} bytes)`);
} else {
    results.push(`SKIP: installed Yaru ${installed ?? '(none)'} is not the vendored ${vendored}; exactness not checked`);
}

for (const id of ['jeweltone-dark', 'jeweltone-light']) {
    const palette = resolvePalette(parsePalette(id, JSON.parse(read(`${root}/data/palettes/${id}.json`))));
    const c = palette.colors;
    const gtk3 = await buildGtk3(palette, { vendorDir, workDir: work(`${id}-gtk3`), gtkTheme: 'Yaru-purple-dark' });
    const handle = gtk3.assets['text-select-end-active.png'];
    check(hasColor(handle, c.primary) && !hasColor(handle, YARU_PURPLE),
        `${id} GTK 3: the accent images are drawn in the palette's accent, with no Yaru purple`);
    check(!/#7764d8/i.test(gtk3.css), `${id} GTK 3: no Yaru purple left`);
    check(gtk3.css.includes(c.primary) && gtk3.css.includes(c.surface), `${id} GTK 3: primary and surface are used`);
    check(new RegExp(`@define-color theme_bg_color ${c.surface}`, 'i').test(gtk3.css), `${id} GTK 3: theme_bg_color is surface`);
    const shell = await buildShell(palette, { vendorDir, workDir: work(`${id}-shell`) });
    check(!shell.css.includes('-st-accent'), `${id} shell: no runtime accent left`);
    check(shell.accentReplaced > 100, `${id} shell: ${shell.accentReplaced} accent uses replaced`);
    check(shell.css.includes(c.surface), `${id} shell: surface is used`);
}

// Every built-in palette must build; an accent outside Yaru's range has to degrade, not stop the build.
const palettesDir = `${root}/data/palettes`;
const ids = decoder.decode(GLib.spawn_sync(null, ['ls', palettesDir], null, GLib.SpawnFlags.SEARCH_PATH, null)[1])
    .split('\n').filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
const broken = [];
const queue = [...ids];
const BUILDERS = 4;
let built = 0;
await Promise.all(Array.from({ length: BUILDERS }, async () => {
    for (let id; (id = queue.shift());) {
        const palette = resolvePalette(parsePalette(id, JSON.parse(read(`${palettesDir}/${id}.json`))));
        try {
            await buildGtk3(palette, { vendorDir, workDir: work(`all-${id}-gtk3`) });
            await buildShell(palette, { vendorDir, workDir: work(`all-${id}-shell`) });
            built++;
        } catch (e) {
            broken.push(`${id}: ${e.message.split('\n')[0]}`);
        }
    }
}));
check(ids.length === 50 && built === 50 && broken.length === 0, `all ${ids.length} built-in palettes build (${built} built)${broken.length ? `: ${broken.join('; ')}` : ''}`);

let message = '';
try {
    await sassc(`${tmp}/missing.scss`, `${tmp}/out.css`, []);
} catch (e) {
    message = e.message;
}
check(/sassc failed/.test(message), 'a failing compile reports the compiler\'s message');

spawn(['rm', '-rf', tmp]);
for (const r of results)
    print(r);
if (failures)
    imports.system.exit(1);
