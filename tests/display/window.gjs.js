// The app window in a headless compositor, driven through its own methods: palettes load, selecting
// one updates the preview and the saved choice, Apply and Restore work on a temporary home, targets
// and fonts are honored, the editor saves a palette, and the extension banner shows when there is no
// shell. Saves screenshots to $CHROMANCY_SHOT_DIR when set. Run by tools/display-test.sh.
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

import { ChromancyWindow } from '../../app/window.js';
import { defaultContext } from '../../app/runner.js';

const tmp = GLib.getenv('CHROMANCY_TEST_TMP');
if (!tmp || GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('run through tools/display-test.sh');
    imports.system.exit(2);
}
const shots = GLib.getenv('CHROMANCY_SHOT_DIR');
const home = `${tmp}/home`;
const ctx = { ...defaultContext({ config: `${home}/config`, data: `${home}/data`, state: `${home}/state` }), gtkTheme: 'Yaru-purple-dark' };
const read = p => (GLib.file_test(p, GLib.FileTest.EXISTS) ? new TextDecoder().decode(GLib.file_get_contents(p)[1]) : null);
const config = () => JSON.parse(read(ctx.configPath) ?? 'null');
const sleep = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
const waitFor = async (fn, ms = 5000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end)
        await sleep(50);
    return fn();
};

let failures = 0;
const check = (ok, what) => {
    print(`${ok ? 'ok' : 'FAIL'}: ${what}`);
    if (!ok)
        failures++;
};

function shot(win, name) {
    if (!shots)
        return;
    const w = win.get_width(), h = win.get_height();
    const snap = new Gtk.Snapshot();
    new Gtk.WidgetPaintable({ widget: win }).snapshot(snap, w, h);
    win.get_renderer().render_texture(snap.to_node(), null).save_to_png(`${shots}/window-${name}.png`);
}

async function main(app) {
    const win = new ChromancyWindow({ application: app, ctx });
    win.present();
    await win.ready;
    await sleep(400);
    const count = flow => {
        let n = 0;
        for (let c = flow.get_first_child(); c; c = c.get_next_sibling())
            n++;
        return n;
    };
    const cards = win._flowBoxes.reduce((n, f) => n + count(f), 0);
    check(cards === 50, `50 palette cards (${cards})`);
    check(count(win._sections.dark.builtIn) === 25 && count(win._sections.light.builtIn) === 25,
        'dark palettes in the Dark tab, light ones in the Light tab');
    check(!win._sections.dark.mineBox.get_visible() && !win._sections.light.mineBox.get_visible(), 'no "Yours" section without palettes of your own');
    win.select('catppuccin-latte');
    await sleep(300);
    check(win._variantStack.get_visible_child_name() === 'light', 'selecting a light palette shows the Light tab');
    shot(win, 'palettes-light');
    const groupedRows = win._targetRows.length;
    check(groupedRows === 13 && win._targetRows.some(r => r.ids.join() === 'conjure,plaid' && r.row.get_title() === 'Shell extensions'),
        `Apply To shows the shell extensions as one switch (${groupedRows} switches)`);
    check(await waitFor(() => win._banner.get_revealed(), 4000), 'with no shell extension running, the banner says so');

    // The checks below are about the desktop targets; the others have their own test (targets.gjs.js).
    for (const id of ['flatpak', 'qt', 'conjure', 'plaid', 'ptyxis', 'btop', 'text-editor', 'templates', 'blacklist'])
        await win.setTarget(id, false);
    win.select('jeweltone-dark');
    await sleep(300);
    check(win._selName.get_label() === 'Jeweltone Dark', 'selecting a palette shows it');
    check(config()?.palette === 'jeweltone-dark', 'and saves the choice');
    shot(win, 'palettes');

    let results = await win.applySelected();
    const statuses = results.map(r => `${r.target}:${r.status}`);
    const images = results.filter(r => r.subject.includes('/gtk-3.0/assets/'));
    check(results.length - images.length === 6 && images.length === 24 && results.every(r => r.status === 'applied'),
        `Apply applies every target, with the 24 GTK 3 accent images (${statuses.length} results)`);
    check(read(`${ctx.paths.config}/gtk-4.0/chromancy-theming.css`)?.includes('#e3c078'), 'the GTK 4 stylesheet is written');
    check(config()?.applied === 'jeweltone-dark', 'the applied palette is remembered');
    const details = win.showResults(results);
    await sleep(500);
    shot(win, 'details');
    details.close();
    await sleep(300);

    await win.setTarget('gtk3', false);
    check(!config().targets.includes('gtk3'), 'turning a target off is saved');
    await win.setFont('monospace', 'Ubuntu Sans Mono 13');
    check(config().fonts.monospace === 'Ubuntu Sans Mono 13', 'a chosen font is saved');
    results = await win.applySelected();
    check(!results.some(r => r.target === 'gtk3'), 'a turned-off target is not applied');
    check(new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).get_string('monospace-font-name') === 'Ubuntu Sans Mono 13',
        'the chosen font is applied');
    win._stack.set_visible_child_name('fonts');
    await sleep(300);
    shot(win, 'fonts');
    win._stack.set_visible_child_name('targets');
    await sleep(300);
    shot(win, 'targets');
    win._stack.set_visible_child_name('palettes');

    const editor = win.openEditor();
    await sleep(400);
    editor._name.set_text('Golden Hour');
    editor._colors.primary = '#d08a3c';
    editor._update();
    await sleep(200);
    shot(win, 'editor');
    editor._save();
    check(await waitFor(() => win.palettes.has('golden-hour')), 'the editor saves a palette that then appears');
    const saved = JSON.parse(read(`${ctx.userPalettes}/golden-hour.json`) ?? '{}');
    check(saved.colors?.primary === '#d08a3c' && saved.terminal?.ansi?.length === 16, 'with its colors and the terminal colors it started from');
    check(win.selected?.id === 'golden-hour', 'and selects it');
    check(win._sections.dark.mineBox.get_visible() && count(win._sections.dark.mine) === 1, 'it is under "Yours" in the Dark tab');
    const yourCard = win._cardOf('golden-hour').child.get_child();
    check(yourCard.get_first_child() instanceof Gtk.Overlay && yourCard.get_first_child().get_child()?.get_height() >= 80,
        'your card shows its swatch, with the delete button over it');
    check(win._deleteButton.get_visible(), 'a palette of your own can be deleted from the preview pane');
    await sleep(300);
    shot(win, 'palettes-yours');
    check(await win.deletePalette('golden-hour'), 'deleting it succeeds');
    check(read(`${ctx.userPalettes}/golden-hour.json`) === null && !win.palettes.has('golden-hour'), 'its file and card are gone');
    check(!win._sections.dark.mineBox.get_visible(), 'and the "Yours" section with it');
    check(!win._deleteButton.get_visible(), 'built-in palettes cannot be deleted');

    const calc = `${ctx.paths.data}/applications/org.gnome.Calculator.desktop`;
    results = await win.addToBlacklist('org.gnome.Calculator.desktop');
    check(results && !results.some(r => r.status === 'failed'), 'blacklisting an app applies without failures');
    check(read(calc)?.includes('chromancy-theming-unthemed'), 'its launcher now runs through the wrapper');
    check(config().blacklist.includes('org.gnome.Calculator.desktop'), 'the blacklist is saved');
    win._stack.set_visible_child_name('blacklist');
    await sleep(300);
    shot(win, 'blacklist');
    const chooser = win.openAppChooser();
    await sleep(500);
    shot(win, 'add-app');
    chooser.close();
    await sleep(300);
    await win.removeFromBlacklist('org.gnome.Calculator.desktop');
    check(read(calc) === null && !config().blacklist.length, 'taking it off the blacklist removes the override');
    win._stack.set_visible_child_name('palettes');

    results = await win.restoreAll();
    check(results.every(r => r.status !== 'failed'), 'Restore succeeds');
    check(read(`${ctx.paths.config}/gtk-4.0/gtk.css`) === null, 'and removes what Apply wrote');
    check(config().applied === null, 'and nothing is marked applied');
    app.quit();
}

const app = new Adw.Application({ application_id: 'io.github.excelsies.ChromancyTheming.WindowTest', flags: Gio.ApplicationFlags.NON_UNIQUE });
app.connect('activate', () => {
    app.hold();
    main(app).catch(e => {
        printerr(`FAIL: ${e}\n${e.stack}`);
        failures++;
    }).finally(() => {
        app.release();
        app.quit();
    });
});
app.run([]);
if (failures)
    imports.system.exit(1);
