// Chromancy Theming's shell side: loads the shell theme Chromancy rebuilds with the palette, and
// exports PickWindow on the session bus (object path below, on GNOME Shell's connection) so the app
// can learn which app a window belongs to.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { ShellTheme } from './shellTheme.js';
import { PickError, Picker } from './picker.js';

export const OBJECT_PATH = '/io/github/excelsies/ChromancyTheming/Shell';
export const INTERFACE = 'io.github.excelsies.ChromancyTheming.Shell';
export const ERROR_DOMAIN = 'io.github.excelsies.ChromancyTheming.Error';

const XML = `<node>
  <interface name="${INTERFACE}">
    <method name="PickWindow">
      <arg type="s" direction="out" name="app_id"/>
      <arg type="s" direction="out" name="app_name"/>
    </method>
  </interface>
</node>`;

const ERROR_NAMES = { busy: 'Busy', cancelled: 'Cancelled', timeout: 'Timeout', 'no-app': 'NoApp' };

export default class ChromancyThemingExtension extends Extension {
    enable() {
        const log = msg => console.warn(`[chromancy-theming] ${msg}`);
        this.shellTheme = new ShellTheme({
            path: GLib.build_filenamev([GLib.get_user_data_dir(), 'chromancy-theming', 'shell', 'gnome-shell.css']),
            log,
        });
        this.shellTheme.start();
        this.picker = new Picker();
        this._dbus = Gio.DBusExportedObject.wrapJSObject(XML, {
            PickWindowAsync: (_params, invocation) => {
                this.picker.pick().then(({ id, name }) => {
                    invocation.return_value(new GLib.Variant('(ss)', [id, name]));
                }).catch(e => {
                    const code = e instanceof PickError ? ERROR_NAMES[e.code] : 'Failed';
                    invocation.return_dbus_error(`${ERROR_DOMAIN}.${code}`, e.message);
                });
            },
        });
        this._dbus.export(Gio.DBus.session, OBJECT_PATH);
    }

    disable() {
        this._dbus?.unexport();
        this._dbus = null;
        this.picker?.cancel();
        this.picker = null;
        this.shellTheme?.stop();
        this.shellTheme = null;
    }
}
