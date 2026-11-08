// Probe app for gtk3.gjs.js: a GTK 3 window with a label and a suggested button; prints the colors
// GTK computed, as JSON, and quits. Not a test on its own (no .gjs.js suffix).
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';

Gtk.init(null);
const hex = c => `#${[c.red, c.green, c.blue].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
const win = new Gtk.Window();
const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
const label = new Gtk.Label({ label: 'text' });
const button = new Gtk.Button({ label: 'suggested' });
button.get_style_context().add_class('suggested-action');
box.add(label);
box.add(button);
win.add(box);
win.show_all();
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
    const ctx = win.get_style_context();
    print(JSON.stringify({
        text: hex(label.get_style_context().get_color(Gtk.StateFlags.NORMAL)),
        suggested: hex(button.get_child().get_style_context().get_color(Gtk.StateFlags.NORMAL)),
        windowBg: hex(ctx.get_property('background-color', Gtk.StateFlags.NORMAL)),
    }));
    Gtk.main_quit();
    return GLib.SOURCE_REMOVE;
});
Gtk.main();
