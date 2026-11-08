// Apps that keep their own colors, filled from templates in data/templates: Ptyxis (a palette, selected
// in the default profile), btop (a theme, selected in btop.conf) and Text Editor (a GtkSourceView style
// scheme). They need the palette's terminal colors.
//
// Ptyxis loads a palette file once: a running Ptyxis picks up a new palette file but not a change to one
// it has loaded. So each Chromancy palette gets a Ptyxis palette of its own (Chromancy-<id>); switching
// creates the new one, selects it, and the previous one is removed by the same Apply.

import { render, templateVars } from '../template.js';
import { TargetSkipped, bundledTemplate, requireTerminal } from './common.js';

/** The Ptyxis palette (file name and Name) for a Chromancy palette. */
export const ptyxisPaletteId = palette => `Chromancy-${palette.id}`;
export const TEXT_EDITOR_SCHEME = 'chromancy-theming';

export const ptyxis = {
    id: 'ptyxis',
    title: 'Ptyxis terminal',
    lock: 'none',
    async inspect(ctx) {
        if (!await ctx.system.hasProgram('ptyxis'))
            return { available: false, reason: 'Ptyxis is not installed' };
        const { value: uuid } = await ctx.system.readSetting({ schema: 'org.gnome.Ptyxis', key: 'default-profile-uuid' });
        return { available: true, profilePath: uuid ? `/org/gnome/Ptyxis/Profiles/${uuid}/` : null,
            template: await bundledTemplate(ctx, 'ptyxis.palette') };
    },
    plan(palette, { paths, info }) {
        requireTerminal(palette);
        if (!info.profilePath)
            throw new TargetSkipped('Ptyxis has no default profile yet');
        const id = ptyxisPaletteId(palette);
        return [
            { target: 'ptyxis', kind: 'file', path: `${paths.data}/org.gnome.Ptyxis/palettes/${id}.palette`,
                content: render(info.template, { ...templateVars(palette), 'ptyxis-id': id }) },
            { target: 'ptyxis', kind: 'setting', schema: 'org.gnome.Ptyxis.Profile', path: info.profilePath, key: 'palette', value: id },
        ];
    },
};

export const btop = {
    id: 'btop',
    title: 'btop',
    lock: 'none',
    async inspect(ctx) {
        if (!await ctx.system.hasProgram('btop'))
            return { available: false, reason: 'btop is not installed' };
        return { available: true, template: await bundledTemplate(ctx, 'btop.theme') };
    },
    plan(palette, { paths, info }) {
        requireTerminal(palette);
        return [
            { target: 'btop', kind: 'file', path: `${paths.config}/btop/themes/chromancy-theming.theme`,
                content: render(info.template, templateVars(palette)) },
            { target: 'btop', kind: 'ini', path: `${paths.config}/btop/btop.conf`, group: null, key: 'color_theme', value: '"chromancy-theming"' },
        ];
    },
};

export const textEditor = {
    id: 'text-editor',
    title: 'Text Editor',
    lock: 'none',
    async inspect(ctx) {
        if (!await ctx.system.hasProgram('gnome-text-editor'))
            return { available: false, reason: 'Text Editor is not installed' };
        return { available: true, template: await bundledTemplate(ctx, 'gtksourceview.xml') };
    },
    plan(palette, { paths, info }) {
        requireTerminal(palette);
        return [
            { target: 'text-editor', kind: 'file', path: `${paths.data}/gtksourceview-5/styles/${TEXT_EDITOR_SCHEME}.xml`,
                content: render(info.template, templateVars(palette)) },
            { target: 'text-editor', kind: 'setting', schema: 'org.gnome.TextEditor', key: 'style-scheme', value: TEXT_EDITOR_SCHEME },
        ];
    },
};
