// Keeping chosen apps out of the theme. An app is named by its desktop file id
// (org.gnome.Nautilus.desktop). How it is kept unthemed depends on what it is:
//   host app   its launcher (a user copy of its desktop file) and, for D-Bus-activated apps, its D-Bus
//              service run it through bin/chromancy-theming-unthemed, which hides Chromancy's
//              stylesheets from that process only;
//   Flatpak    a per-app override denies it the GTK stylesheet directories;
//   Snap       its own gtk.css links point at a copy of the user's gtk.css without Chromancy's line;
//   and an app Chromancy themes through a target of its own (Ptyxis, btop, Text Editor) has that target
//   skipped.

/** First line of every desktop or service file Chromancy wraps. */
export const BLACKLIST_MARKER = '# Chromancy Theming: runs this app without the theme (Restore or un-blacklisting removes this copy).';

/** Apps with a target of their own. */
export const APP_TARGETS = Object.freeze({
    'org.gnome.Ptyxis.desktop': 'ptyxis',
    'org.gnome.TextEditor.desktop': 'text-editor',
    'btop.desktop': 'btop',
});

const value = (text, key) => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1]?.trim() ?? null;

/** What kind of app a desktop file launches. */
export function appKind(desktop) {
    const flatpak = value(desktop, 'X-Flatpak');
    if (flatpak)
        return { kind: 'flatpak', flatpakId: flatpak };
    const snap = value(desktop, 'X-SnapInstanceName');
    if (snap)
        return { kind: 'snap', snapName: snap };
    return { kind: 'host', dbus: value(desktop, 'DBusActivatable') === 'true' };
}

export function busName(desktopId) {
    return desktopId.replace(/\.desktop$/, '');
}

/** Every Exec= line through the wrapper; a file already wrapped comes back the same. */
export function wrapExec(text, wrapper) {
    const body = text.startsWith(`${BLACKLIST_MARKER}\n`) ? text.slice(BLACKLIST_MARKER.length + 1) : text;
    const wrapped = body.split('\n').map(line => {
        const m = /^Exec=(.*)$/.exec(line);
        if (!m || m[1].startsWith(`${wrapper} `))
            return line;
        return `Exec=${wrapper} ${m[1]}`;
    }).join('\n');
    return `${BLACKLIST_MARKER}\n${wrapped}`;
}
