// GTK 3 apps: Yaru rebuilt with the palette (app/yaruBuild.js), imported from the user's gtk.css by
// one managed line. The stylesheet is a whole Yaru theme loaded above the installed one, so every
// rule follows the palette. Its images come from the installed Yaru theme GTK 3 has loaded, through
// resource:// URLs (which also work inside Snap apps), except the ones Yaru draws with its accent: those
// are rendered with the palette and written to ~/.local/share/chromancy-theming/gtk-3.0/assets (Snap
// apps cannot read them there).

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
        const assetsDir = `${paths.data}/chromancy-theming/gtk-3.0/assets`;
        const rendered = built.assets ?? {};
        let css = built.css;
        for (const file of Object.keys(rendered))
            css = css.split(`url("assets/${file}")`).join(`url("${fileUrl(`${assetsDir}/${file}`)}")`);
        css = css.replace(/url\("assets\//g, `url("resource:///com/ubuntu/themes/${gtkTheme}/3.0/assets/`);
        const dir = `${paths.config}/gtk-3.0`;
        return [
            ...Object.entries(rendered).map(([file, content]) =>
                ({ target: 'gtk3', kind: 'file', encoding: 'base64', path: `${assetsDir}/${file}`, content })),
            {
                target: 'gtk3', kind: 'file', path: `${dir}/${STYLESHEET}`,
                content: `/* Chromancy Theming: Yaru rebuilt with the palette "${palette.name}". Rewritten on every Apply. */\n${css}`,
            },
            { target: 'gtk3', kind: 'line', path: `${dir}/gtk.css`, line: `@import url("${fileUrl(`${dir}/${STYLESHEET}`)}"); ${LINE_MARKER}` },
        ];
    },
};
