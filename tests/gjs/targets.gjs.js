// The app and integration targets end to end on a temporary home (in-memory settings): Conjure
// Launcher and Plaid (fixture schemas in the home's extensions directory), Flatpak, Qt, Ptyxis, btop,
// Text Editor and a user template. Targets whose program is not installed here are expected to be
// skipped, and are reported so.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { applyPalette, defaultContext, loadPalettes, restoreTargets } from '../../app/runner.js';

if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('refusing to run: set GSETTINGS_BACKEND=memory');
    imports.system.exit(2);
}
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 120, () => {
    printerr('FAIL: still running after 120 s');
    imports.system.exit(1);
});

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const tmp = GLib.dir_make_tmp('chromancy-targets-XXXXXX');
const home = `${tmp}/home`;
const ctx = { ...defaultContext({ config: `${home}/.config`, data: `${home}/.local/share`, state: `${home}/.local/state`, home }),
    gtkTheme: 'Yaru-purple-dark' };
const read = p => (GLib.file_test(p, GLib.FileTest.EXISTS) ? new TextDecoder().decode(GLib.file_get_contents(p)[1]) : null);
const write = (p, t) => {
    GLib.mkdir_with_parents(GLib.path_get_dirname(p), 0o700);
    GLib.file_set_contents(p, t);
};
const run = argv => GLib.spawn_sync(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null)[3] === 0;
const lines = [];
let failures = 0;
const check = (ok, what) => {
    lines.push(`${ok ? 'ok' : 'FAIL'}: ${what}`);
    if (!ok)
        failures++;
};

// Extension schemas where the targets look for them.
for (const [uuid, file] of [['conjure-launcher@excelsies', 'conjure'], ['plaid@plyply99', 'plaid']]) {
    const dir = `${ctx.paths.data}/gnome-shell/extensions/${uuid}/schemas`;
    write(`${dir}/${file}.gschema.xml`, read(`${here}/../fixtures/schemas/${file}.gschema.xml`));
    run(['glib-compile-schemas', dir]);
}
const ext = (schema, uuid) => new Gio.Settings({ settings_schema: Gio.SettingsSchemaSource.new_from_directory(
    `${ctx.paths.data}/gnome-shell/extensions/${uuid}/schemas`, Gio.SettingsSchemaSource.get_default(), false).lookup(schema, false) });
const conjureSettings = ext('org.gnome.shell.extensions.conjure-launcher', 'conjure-launcher@excelsies');
const plaidSettings = ext('org.gnome.shell.extensions.plaid', 'plaid@plyply99');
conjureSettings.set_string('theme-primary', '#123456');  // the user's own Conjure color

// Existing app config the targets must respect.
write(`${ctx.paths.config}/qt6ct/qt6ct.conf`, '[Appearance]\nstyle=Fusion\n');
write(`${ctx.paths.config}/btop/btop.conf`, '#? Config file for btop\ncolor_theme = "jeweltone"\ntheme_background = false\n');
write(`${ctx.paths.data}/flatpak/overrides/global`, '[Context]\nfilesystems=xdg-download;\n');
// Ptyxis's settings exist only where it is installed, like the checks that read them below.
const has = name => GLib.find_program_in_path(name) !== null;
if (has('ptyxis'))
    new Gio.Settings({ schema_id: 'org.gnome.Ptyxis' }).set_string('default-profile-uuid', 'test-profile');
write(`${ctx.userTemplates}/kitty.tmpl`, 'chromancy-output: ~/.config/kitty/chromancy.conf\nbackground {{term-background}}\nforeground {{term-foreground}}\n');

const { palettes } = loadPalettes(ctx);
const targets = ['flatpak', 'qt', 'conjure', 'plaid', 'ptyxis', 'btop', 'text-editor', 'templates'];
let r = await applyPalette(palettes.get('jeweltone-dark'), targets, ctx);
const by = t => r.results.filter(x => x.target === t);
lines.push(`# ${r.results.map(x => `${x.target}:${x.status}`).join(', ')}`);
check(!r.results.some(x => x.status === 'failed'), `nothing failed (${r.results.filter(x => x.status === 'failed').map(x => `${x.target}: ${x.error}`).join('; ')})`);

check(conjureSettings.get_string('theme-override-source') === 'Chromancy Theming' && conjureSettings.get_string('theme-primary') === '#e3c078',
    'Conjure: named the source and wrote the tokens');
check(JSON.stringify(plaidSettings.get_strv('active-border-color-2')) === '["#b392d4"]'
    && JSON.stringify(plaidSettings.get_strv('inactive-border-color')) === '["#4a3e52"]', 'Plaid: gradient and inactive borders');
if (has('flatpak'))
    check(read(`${ctx.paths.data}/flatpak/overrides/global`) === '[Context]\nfilesystems=xdg-download;xdg-config/gtk-4.0:ro;xdg-config/gtk-3.0:ro;\n', 'Flatpak: grants added, the user\'s kept');
else
    check(by('flatpak')[0]?.status === 'skipped', 'Flatpak: skipped (not installed here)');
if (has('qt6ct')) {
    const conf = read(`${ctx.paths.config}/qt6ct/qt6ct.conf`);
    check(conf.startsWith('[Appearance]\nstyle=Fusion\ncolor_scheme_path=') && conf.includes('custom_palette=true'), 'Qt: qt6ct.conf keeps the style and selects the scheme');
    check(/^QT_QPA_PLATFORMTHEME=qt6ct$/m.test(read(`${ctx.paths.config}/environment.d/chromancy-theming.conf`) ?? ''), 'Qt: the platform theme is set for the next login');
}
if (has('ptyxis')) {
    check(read(`${ctx.paths.data}/org.gnome.Ptyxis/palettes/Chromancy-jeweltone-dark.palette`)?.includes('Color11=#e3c078'), 'Ptyxis: palette written');
    const profile = new Gio.Settings({ schema_id: 'org.gnome.Ptyxis.Profile', path: '/org/gnome/Ptyxis/Profiles/test-profile/' });
    check(profile.get_string('palette') === 'Chromancy-jeweltone-dark', 'Ptyxis: selected in the default profile');
}
if (has('btop')) {
    check(read(`${ctx.paths.config}/btop/btop.conf`) === '#? Config file for btop\ncolor_theme = "chromancy-theming"\ntheme_background = false\n', 'btop: theme selected, other settings kept');
    check(read(`${ctx.paths.config}/btop/themes/chromancy-theming.theme`)?.includes('theme[hi_fg]="#e3c078"'), 'btop: theme written');
}
if (has('gnome-text-editor')) {
    check(read(`${ctx.paths.data}/gtksourceview-5/styles/chromancy-theming.xml`)?.includes('<style name="def:keyword" foreground="#a87fc8"'), 'Text Editor: scheme written');
    check(new Gio.Settings({ schema_id: 'org.gnome.TextEditor' }).get_string('style-scheme') === 'chromancy-theming', 'Text Editor: scheme selected');
}
check(read(`${home}/.config/kitty/chromancy.conf`) === 'background #0b0910\nforeground #ede4d9\n', 'your template: written where its first line says');

// A palette without terminal colors skips the terminal apps but still themes the rest.
r = await applyPalette(palettes.get('noctalia'), targets, ctx);
check(['ptyxis', 'btop', 'text-editor'].filter(has.bind(null)).length === 0
    || r.results.filter(x => ['ptyxis', 'btop', 'text-editor'].includes(x.target) && x.subject === 'target').every(x => x.status === 'skipped'),
    'a palette without terminal colors skips the terminal apps');
check(conjureSettings.get_string('theme-primary') === palettes.get('noctalia').colors.primary, 'and still themes Conjure');
if (has('ptyxis')) {
    const profile = new Gio.Settings({ schema_id: 'org.gnome.Ptyxis.Profile', path: '/org/gnome/Ptyxis/Profiles/test-profile/' });
    check(profile.get_user_value('palette') === null && read(`${ctx.paths.data}/org.gnome.Ptyxis/palettes/Chromancy-jeweltone-dark.palette`) === null,
        'and puts the terminal back as it was, rather than leaving the previous palette\'s colors');
}

// Conjure's lock: nothing is written while it is on.
conjureSettings.set_boolean('theme-overrides-locked', true);
r = await applyPalette(palettes.get('jeweltone-dark'), ['conjure'], ctx);
check(r.results.length === 1 && r.results[0].status === 'locked', 'a locked Conjure is reported locked');
check(conjureSettings.get_string('theme-primary') === palettes.get('noctalia').colors.primary, 'and not written');
conjureSettings.set_boolean('theme-overrides-locked', false);

r = await restoreTargets(undefined, ctx);
const conjureOrder = r.results.filter(x => x.target === 'conjure').map(x => x.subject.split('/').pop());
check(conjureOrder.indexOf('theme-primary') < conjureOrder.indexOf('theme-override-source'), 'restore resets Conjure\'s tokens before its source name');
check(conjureSettings.get_string('theme-primary') === '#123456' && conjureSettings.get_string('theme-override-source') === '',
    'Conjure is back to the user\'s color, with no source named');
check(conjureSettings.get_user_value('theme-surface') === null, 'and its untouched tokens are back to empty');
if (has('flatpak'))
    check(read(`${ctx.paths.data}/flatpak/overrides/global`) === '[Context]\nfilesystems=xdg-download;\n', 'Flatpak overrides back to the user\'s');
if (has('qt6ct')) {
    check(read(`${ctx.paths.config}/qt6ct/qt6ct.conf`) === '[Appearance]\nstyle=Fusion\n', 'qt6ct.conf back as it was');
    check(read(`${ctx.paths.config}/environment.d/chromancy-theming.conf`) === null, 'the environment file is gone');
}
if (has('btop'))
    check(read(`${ctx.paths.config}/btop/btop.conf`).includes('color_theme = "jeweltone"'), 'btop back to the user\'s theme');
check(read(`${home}/.config/kitty/chromancy.conf`) === null, 'the template output is gone');

GLib.spawn_sync(null, ['rm', '-rf', tmp], null, GLib.SpawnFlags.SEARCH_PATH, null);
for (const l of lines)
    print(l);
if (failures)
    imports.system.exit(1);
