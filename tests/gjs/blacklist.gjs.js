// The blacklist end to end on a temporary home: a host app (with its D-Bus service), a Flatpak app and a
// Snap app (with the gtk.css links its launcher makes) are kept out of the theme, Ptyxis's own target
// is skipped while Ptyxis is blacklisted, and taking apps off the blacklist removes every override.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { applyPalette, defaultContext, loadPalettes } from '../../app/runner.js';
import { BLACKLIST_MARKER } from '../../lib/blacklist.js';

if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('refusing to run: set GSETTINGS_BACKEND=memory');
    imports.system.exit(2);
}
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 120, () => {
    printerr('FAIL: still running after 120 s');
    imports.system.exit(1);
});

const tmp = GLib.dir_make_tmp('chromancy-blacklist-XXXXXX');
const home = `${tmp}/home`;
const sys = `${tmp}/usr-share`;
const base = defaultContext({ config: `${home}/.config`, data: `${home}/.local/share`, state: `${home}/.local/state`, home, systemDataDirs: [sys] });
const ctx = blacklist => ({ ...base, gtkTheme: 'Yaru-purple-dark', blacklist });
const read = p => (GLib.file_test(p, GLib.FileTest.EXISTS) ? new TextDecoder().decode(GLib.file_get_contents(p)[1]) : null);
const write = (p, t) => {
    GLib.mkdir_with_parents(GLib.path_get_dirname(p), 0o700);
    GLib.file_set_contents(p, t);
};
const link = p => {
    try {
        const info = Gio.File.new_for_path(p).query_info('standard::is-symlink,standard::symlink-target', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        return info.get_is_symlink() ? info.get_symlink_target() : null;
    } catch {
        return null;
    }
};
const lines = [];
let failures = 0;
const check = (ok, what) => {
    lines.push(`${ok ? 'ok' : 'FAIL'}: ${what}`);
    if (!ok)
        failures++;
};

write(`${sys}/applications/org.gnome.Settings.desktop`, '[Desktop Entry]\nName=Settings\nExec=gnome-control-center\nDBusActivatable=true\n');
write(`${sys}/dbus-1/services/org.gnome.Settings.service`, '[D-BUS Service]\nName=org.gnome.Settings\nExec=/usr/bin/gnome-control-center --gapplication-service\n');
write(`${sys}/applications/org.x.App.desktop`, '[Desktop Entry]\nName=X\nExec=/usr/bin/flatpak run org.x.App\nX-Flatpak=org.x.App\n');
write(`${sys}/applications/demo_demo.desktop`, '[Desktop Entry]\nName=Demo\nExec=/snap/bin/demo\nX-SnapInstanceName=demo\n');
write(`${home}/.config/gtk-4.0/gtk.css`, 'window.mine { }\n');
// The Snap's revision folder, its "current" link, and the gtk.css link its launcher makes.
GLib.mkdir_with_parents(`${home}/snap/demo/42/.config/gtk-4.0`, 0o700);
Gio.File.new_for_path(`${home}/snap/demo/current`).make_symbolic_link('42', null);
Gio.File.new_for_path(`${home}/snap/demo/42/.config/gtk-4.0/gtk.css`).make_symbolic_link(`${home}/.config/gtk-4.0/gtk.css`, null);

const { palettes } = loadPalettes(base);
const dark = palettes.get('jeweltone-dark');
const all = ['gtk4', 'blacklist', 'ptyxis'];
const listed = ['org.gnome.Settings.desktop', 'org.x.App.desktop', 'demo_demo.desktop', 'gone.desktop', 'org.gnome.Ptyxis.desktop'];
let r = await applyPalette(dark, all, ctx(listed));
lines.push(`# ${r.results.filter(x => x.target !== 'gtk4').map(x => `${x.target}:${x.status}${x.error ? ` (${x.error})` : ''}`).join(', ')}`);
check(!r.results.some(x => x.status === 'failed'), 'nothing failed');

const launcher = read(`${home}/.local/share/applications/org.gnome.Settings.desktop`);
check(launcher?.startsWith(BLACKLIST_MARKER) && launcher.includes(`Exec=${base.wrapper} gnome-control-center`), 'Settings: launcher runs through the wrapper');
check(read(`${home}/.local/share/dbus-1/services/org.gnome.Settings.service`)?.includes(`Exec=${base.wrapper} /usr/bin/gnome-control-center --gapplication-service`),
    'Settings: D-Bus service runs through the wrapper');
check(read(`${home}/.local/share/flatpak/overrides/org.x.App`) === '[Context]\nfilesystems=!xdg-config/gtk-4.0;!xdg-config/gtk-3.0;\n', 'Flatpak app: GTK stylesheets denied');
check(link(`${home}/snap/demo/42/.config/gtk-4.0/gtk.css`) === `${home}/.config/gtk-4.0/chromancy-theming-unthemed.css`, 'Snap: gtk.css link points at the unthemed copy');
check(read(`${home}/.config/gtk-4.0/chromancy-theming-unthemed.css`) === 'window.mine { }\n', 'the unthemed copy is the user\'s gtk.css without Chromancy\'s line');
check(r.results.some(x => x.subject === 'note' && /gone\.desktop is not installed/.test(x.error)), 'an app that is not installed is a note');
check(r.results.some(x => x.target === 'ptyxis' && x.status === 'skipped' && /blacklisted/.test(x.error)), 'Ptyxis blacklisted: its own target is skipped');

// Applying again changes nothing (the wrapped files are not wrapped twice).
r = await applyPalette(dark, all, ctx(listed));
check(r.results.filter(x => x.target === 'blacklist' && x.subject !== 'note').every(x => x.status === 'unchanged'), 'applying again changes nothing');

// Taking everything off the blacklist removes every override.
await applyPalette(dark, all, ctx([]));
check(read(`${home}/.local/share/applications/org.gnome.Settings.desktop`) === null, 'un-blacklisted: launcher override removed');
check(read(`${home}/.local/share/dbus-1/services/org.gnome.Settings.service`) === null, 'un-blacklisted: D-Bus override removed');
check(read(`${home}/.local/share/flatpak/overrides/org.x.App`) === null, 'un-blacklisted: Flatpak override removed');
check(link(`${home}/snap/demo/42/.config/gtk-4.0/gtk.css`) === `${home}/.config/gtk-4.0/gtk.css`, 'un-blacklisted: the Snap link points at gtk.css again');
check(read(`${home}/.config/gtk-4.0/chromancy-theming-unthemed.css`) === null, 'the unthemed copy is removed');
check(read(`${home}/.config/gtk-4.0/gtk.css`).endsWith('window.mine { }\n'), 'the user\'s gtk.css content is intact');

GLib.spawn_sync(null, ['rm', '-rf', tmp], null, GLib.SpawnFlags.SEARCH_PATH, null);
for (const l of lines)
    print(l);
if (failures)
    imports.system.exit(1);
