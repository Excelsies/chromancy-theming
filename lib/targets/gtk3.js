// GTK 3 apps: Yaru rebuilt with the palette (app/yaruBuild.js), imported from the user's gtk.css by
// one managed line. The stylesheet is a whole Yaru theme loaded above the installed one, so every
// rule follows the palette. Its images still come from the installed Yaru theme GTK 3 has loaded,
// through resource:// URLs, which also work inside Snap apps.

import { LINE_MARKER } from '../applier.js';
import { STYLESHEET, fileUrl } from './gtk4.js';

const YARU = /^Yaru(-[a-z]+)*$/;

export const gtk3 = {
    id: 'gtk3',
    title: 'GTK 3 apps',
    lock: 'none',
    /** Built before planning, by the builder of this name. */
    build: 'gtk3',
    /**
     * @param {{paths: {config: string}, gtkTheme: string}} ctx gtkTheme: org.gnome.desktop.interface gtk-theme
     * @param {{css: string}} built
     */
    plan(palette, { paths, gtkTheme }, built) {
        if (!YARU.test(gtkTheme ?? ''))
            throw new Error(`the GTK theme is ${JSON.stringify(gtkTheme)}, not Yaru; the rebuilt theme takes its images from Yaru`);
        const assets = `resource:///com/ubuntu/themes/${gtkTheme}/3.0/assets/`;
        const css = built.css.replace(/url\("assets\//g, `url("${assets}`);
        const dir = `${paths.config}/gtk-3.0`;
        return [
            {
                target: 'gtk3', kind: 'file', path: `${dir}/${STYLESHEET}`,
                content: `/* Chromancy Theming: Yaru rebuilt with the palette "${palette.name}". Rewritten on every Apply. */\n${css}`,
            },
            { target: 'gtk3', kind: 'line', path: `${dir}/gtk.css`, line: `@import url("${fileUrl(`${dir}/${STYLESHEET}`)}"); ${LINE_MARKER}` },
        ];
    },
};
