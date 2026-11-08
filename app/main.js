// The application: a single instance, so two applies never run at once. With no arguments it opens
// the window; with a command it runs it (a second invocation hands its command line to the running
// instance and gets its output and exit status back).

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { run } from './cli.js';
import { defaultContext } from './runner.js';
import { ChromancyWindow } from './window.js';

export const APP_ID = 'io.github.excelsies.ChromancyTheming';

const app = new Adw.Application({ application_id: APP_ID, flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE });
// GLib reports 0 for a command line handled in this process once the main loop has run (hold below),
// so this process's own status is kept here; a command line from another process gets its status
// through set_exit_status().
let localStatus = 0;
app.connect('activate', () => {
    const win = app.get_active_window() ?? new ChromancyWindow({ application: app, ctx: defaultContext() });
    win.present();
});
app.connect('command-line', (_app, cmdline) => {
    const args = cmdline.get_arguments().slice(1);
    if (args.length === 0) {
        app.activate();
        return 0;
    }
    app.hold();
    run(args, {
        ctx: defaultContext(),
        out: line => cmdline.print_literal(`${line}\n`),
        err: line => cmdline.printerr_literal(`${line}\n`),
    }).catch(e => {
        cmdline.printerr_literal(`${e}\n`);
        return 1;
    }).then(status => {
        cmdline.set_exit_status(status);
        if (!cmdline.get_is_remote())
            localStatus = status;
    }).finally(() => {
        cmdline.done();
        app.release();
    });
    return 0;
});
GLib.set_prgname('chromancy-theming');
GLib.set_application_name('Chromancy Theming');
const status = app.run([imports.system.programInvocationName, ...ARGV]);
imports.system.exit(status || localStatus);
