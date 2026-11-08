// Probe app for gtk4.gjs.js: shows a label, an accent label and a suggested button, then prints
// the colors GTK computed for them as JSON and quits. Not a test on its own (no .gjs.js suffix).
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

const hex = c => `#${[c.red, c.green, c.blue].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
const app = new Adw.Application({ application_id: 'io.github.excelsies.ChromancyTheming.TestProbe' });
app.connect('activate', () => {
    const win = new Adw.ApplicationWindow({ application: app });
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    const text = new Gtk.Label({ label: 'text' });
    const accent = new Gtk.Label({ label: 'accent', css_classes: ['accent'] });
    const button = new Gtk.Button({ label: 'suggested', css_classes: ['suggested-action'] });
    box.append(text);
    box.append(accent);
    box.append(button);
    win.set_content(box);
    win.present();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        print(JSON.stringify({ text: hex(text.get_color()), accent: hex(accent.get_color()),
            suggested: hex(button.get_child().get_color()) }));
        app.quit();
        return GLib.SOURCE_REMOVE;
    });
});
app.run([]);
