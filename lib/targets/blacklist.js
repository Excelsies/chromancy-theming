// The blacklist (lib/blacklist.js says how each kind of app is kept out of the theme). Applied like any
// target, so restore and un-blacklisting remove every override it made. Apps it cannot handle (not
// installed, a Snap never run) are reported as notes, and the rest still go ahead.

import { withoutLine } from '../applier.js';
import { appKind, busName, wrapExec } from '../blacklist.js';

export const blacklist = {
    id: 'blacklist',
    title: 'Blacklisted apps',
    lock: 'none',
    async inspect(ctx) {
        const dirs = [ctx.paths.data, ...(ctx.systemDataDirs ?? [])];
        const find = async rel => {
            for (const dir of dirs) {
                const text = await ctx.system.readText(`${dir}/${rel}`);
                if (text !== null)
                    return text;
            }
            return null;
        };
        const apps = [];
        for (const id of ctx.blacklist ?? []) {
            const desktop = await find(`applications/${id}`);
            if (desktop === null) {
                apps.push({ id, missing: true });
                continue;
            }
            const kind = appKind(desktop);
            const app = { id, desktop, ...kind };
            if (kind.kind === 'host' && kind.dbus)
                app.service = await find(`dbus-1/services/${busName(id)}.service`);
            if (kind.kind === 'snap')
                app.snapCurrent = await ctx.system.readLink(`${ctx.home}/snap/${kind.snapName}/current`);
            apps.push(app);
        }
        const gtkCss = {};
        for (const v of ['3.0', '4.0'])
            gtkCss[v] = await ctx.system.readText(`${ctx.paths.config}/gtk-${v}/gtk.css`);
        return { available: true, apps, wrapper: ctx.wrapper, home: ctx.home, gtkCss };
    },
    plan(_palette, { paths, info }) {
        const ops = [];
        const notes = [];
        const op = (path, content) => ({ target: 'blacklist', kind: 'file', path, content });
        for (const app of info.apps) {
            if (app.missing) {
                notes.push(`${app.id} is not installed`);
                continue;
            }
            if (app.kind === 'flatpak') {
                ops.push({ target: 'blacklist', kind: 'ini-list', path: `${paths.data}/flatpak/overrides/${app.flatpakId}`,
                    group: 'Context', key: 'filesystems', items: ['!xdg-config/gtk-4.0', '!xdg-config/gtk-3.0'] });
            } else if (app.kind === 'snap') {
                if (!app.snapCurrent) {
                    notes.push(`${app.id}: run it once, then apply again (its Snap folder does not exist yet)`);
                    continue;
                }
                for (const v of ['3.0', '4.0']) {
                    const unthemed = `${paths.config}/gtk-${v}/chromancy-theming-unthemed.css`;
                    ops.push(op(unthemed, withoutLine(info.gtkCss[v] ?? '')));
                    ops.push({ target: 'blacklist', kind: 'symlink', path: `${info.home}/snap/${app.snapName}/current/.config/gtk-${v}/gtk.css`,
                        linkTarget: unthemed });
                }
            } else {
                ops.push(op(`${paths.data}/applications/${app.id}`, wrapExec(app.desktop, info.wrapper)));
                if (app.service)
                    ops.push(op(`${paths.data}/dbus-1/services/${busName(app.id)}.service`, wrapExec(app.service, info.wrapper)));
            }
        }
        // The unthemed gtk.css copies are shared by every Snap; keep one op per file.
        const seen = new Set();
        const out = ops.filter(o => (seen.has(o.path) ? false : seen.add(o.path)));
        out.notes = notes;
        return out;
    },
};
