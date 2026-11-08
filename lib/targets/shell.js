// GNOME Shell menus, panel, quick settings and notifications: Yaru's shell theme rebuilt with the
// palette (app/yaruBuild.js). The helper extension loads this file as the shell's stylesheet; its
// images are the shell theme's own resources, which the session has loaded.

/** Relative to the user data directory (~/.local/share). */
export const SHELL_STYLESHEET = 'chromancy-theming/shell/gnome-shell.css';

export const shell = {
    id: 'shell',
    title: 'GNOME Shell',
    lock: 'none',
    build: 'shell',
    /**
     * @param {{paths: {data: string}}} ctx
     * @param {{css: string}} built
     */
    plan(palette, { paths }, built) {
        return [{
            target: 'shell', kind: 'file', path: `${paths.data}/${SHELL_STYLESHEET}`,
            content: `/* Chromancy Theming: Yaru shell theme rebuilt with the palette "${palette.name}". Rewritten on every Apply. */\n${built.css}`,
        }];
    },
};
