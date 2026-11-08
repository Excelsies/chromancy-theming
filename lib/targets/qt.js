// Qt apps through qt6ct: a color scheme in qt6ct's format (21 colors per state, in QPalette's role
// order, #AARRGGBB), selected in qt6ct.conf with the custom palette on, and the palette's fonts when it
// has them. QT_QPA_PLATFORMTHEME=qt6ct (in environment.d) makes Qt apps use it from the next login.
// Restore puts back only the qt6ct.conf keys Chromancy set.

import { mix } from '../color.js';
import { qtFont } from '../fontnames.js';

const QT_SCHEME = 'chromancy-theming.conf';

/** QPalette roles in qt6ct's order, with the palette color each takes. */
function roles(c) {
    const button = c['surface-container'];
    return [
        ['WindowText', c['on-surface']],
        ['Button', button],
        ['Light', mix(button, '#ffffff', 0.15)],
        ['Midlight', mix(button, '#ffffff', 0.07)],
        ['Dark', mix(button, '#000000', 0.35)],
        ['Mid', mix(button, '#000000', 0.15)],
        ['Text', c['on-surface']],
        ['BrightText', c['on-primary']],
        ['ButtonText', c['on-surface']],
        ['Base', c['surface-container']],
        ['Window', c.surface],
        ['Shadow', '#000000'],
        ['Highlight', c.primary],
        ['HighlightedText', c['on-primary']],
        ['Link', c.primary],
        ['LinkVisited', c.secondary ?? c.primary],
        ['AlternateBase', mix(c['surface-container'], c['on-surface'], 0.04)],
        ['NoRole', '#000000'],
        ['ToolTipBase', c['surface-container']],
        ['ToolTipText', c['on-surface']],
        ['PlaceholderText', c['on-surface-variant']],
    ];
}

const TEXT_ROLES = ['WindowText', 'Text', 'ButtonText', 'HighlightedText', 'ToolTipText', 'PlaceholderText'];
const argb = hex => `#ff${hex.slice(1, 7)}`;

/** The qt6ct color scheme file for a palette. */
export function qtColorScheme(palette) {
    const c = palette.colors;
    const active = roles(c);
    const dimText = mix(c['on-surface'], c.surface, 0.5);
    const disabled = active.map(([role, color]) => [role, TEXT_ROLES.includes(role) ? dimText : color]);
    const line = list => list.map(([, color]) => argb(color)).join(', ');
    return `[ColorScheme]\nactive_colors=${line(active)}\ndisabled_colors=${line(disabled)}\ninactive_colors=${line(active)}\n`;
}

export const qt = {
    id: 'qt',
    title: 'Qt apps',
    lock: 'none',
    async inspect(ctx) {
        return (await ctx.system.hasProgram('qt6ct')) ? { available: true } : { available: false, reason: 'qt6ct is not installed' };
    },
    plan(palette, { paths }) {
        const dir = `${paths.config}/qt6ct`;
        const conf = `${dir}/qt6ct.conf`;
        const ini = (group, key, value) => ({ target: 'qt', kind: 'ini', path: conf, group, key, value });
        const ops = [
            { target: 'qt', kind: 'file', path: `${dir}/colors/${QT_SCHEME}`, content: qtColorScheme(palette) },
            ini('Appearance', 'color_scheme_path', `${dir}/colors/${QT_SCHEME}`),
            ini('Appearance', 'custom_palette', 'true'),
        ];
        if (palette.fonts?.interface)
            ops.push(ini('Fonts', 'general', `"${qtFont(palette.fonts.interface)}"`));
        if (palette.fonts?.monospace)
            ops.push(ini('Fonts', 'fixed', `"${qtFont(palette.fonts.monospace)}"`));
        ops.push({ target: 'qt', kind: 'file', path: `${paths.config}/environment.d/chromancy-theming.conf`,
            content: '# Written by Chromancy Theming: Qt apps follow qt6ct (from the next login).\nQT_QPA_PLATFORMTHEME=qt6ct\n' });
        return ops;
    },
};
