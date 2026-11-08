// The extension loads the shell stylesheet Chromancy writes, follows rewrites and removal, keeps the
// last good one when a new one does not parse, and gives back a stylesheet another extension had set.
// The shell runs with the sandbox's own runtime dir.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, sleep, waitFor } from './lib/harness.js';

const path = GLib.build_filenamev([GLib.get_user_data_dir(), 'chromancy-theming', 'shell', 'gnome-shell.css']);
const panelBg = () => Main.panel.get_theme_node().get_background_color().to_string().slice(0, 7).toLowerCase();
const stylesheet = () => Main.getThemeStylesheet()?.get_path() ?? null;
const write = text => GLib.file_set_contents(path, text);

export async function run() {
    const t = new Suite();
    const ext = extension().stateObj;
    t.check('the extension is enabled', ext?.shellTheme !== undefined);
    t.equal('the shell uses the sandbox\'s own runtime dir, not the user\'s',
        GLib.get_user_runtime_dir(), `${GLib.getenv('CHROMANCY_SANDBOX')}/runtime`);
    t.equal('with no stylesheet written, the session theme is used', stylesheet(), null);
    const yaruPanel = panelBg();

    write('#panel { background-color: #123456; }\n');
    t.check('a written stylesheet is loaded', await waitFor(() => stylesheet() === path, 3000), String(stylesheet()));
    t.check('and styles the panel', await waitFor(() => panelBg() === '#123456', 2000), panelBg());

    write('#panel { background-color: #654321; }\n');
    t.check('a rewrite reloads it', await waitFor(() => panelBg() === '#654321', 3000), panelBg());

    write('#panel { background-color: #abcdef; \n  this is { not css\n');
    await sleep(800);
    t.equal('a stylesheet that does not parse is not loaded; the last good one stays', panelBg(), '#654321');

    GLib.unlink(path);
    t.check('removing it returns to the session theme', await waitFor(() => stylesheet() === null, 3000), String(stylesheet()));
    t.equal('and the panel is the session theme\'s again', panelBg(), yaruPanel);

    // A stylesheet another extension (User Themes) had set is given back.
    const other = GLib.build_filenamev([GLib.get_user_data_dir(), 'other-theme.css']);
    GLib.file_set_contents(other, '#panel { background-color: #0f0f0f; }\n');
    ext.shellTheme.stop();
    Main.setThemeStylesheet(other);
    Main.loadTheme();
    write('#panel { background-color: #123456; }\n');
    ext.shellTheme.start();
    t.equal('Chromancy\'s stylesheet replaces the other one while active', stylesheet(), path);
    ext.shellTheme.stop();
    t.equal('and stopping gives the other one back', stylesheet(), other);
    Main.setThemeStylesheet(null);
    Main.loadTheme();
    Gio.File.new_for_path(path).delete(null);
    t.finish();
}
