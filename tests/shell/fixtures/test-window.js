// A plain window with a known app id, for the picker tests (launched through its desktop file).
import Gtk from 'gi://Gtk?version=4.0';

const app = new Gtk.Application({ application_id: 'io.github.excelsies.ChromancyTheming.TestWindow' });
app.connect('activate', () => {
    const win = new Gtk.ApplicationWindow({ application: app, title: 'Chromancy test window', default_width: 600, default_height: 400 });
    win.present();
});
app.run([]);
