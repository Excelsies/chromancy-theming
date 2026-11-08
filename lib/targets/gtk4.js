// GTK 4 and libadwaita apps: a stylesheet that sets libadwaita's color variables, imported from
// the user's gtk.css by one managed line. Snap apps read the same gtk.css through a symlink, so the
// import uses an absolute file URL (a relative one would resolve inside the Snap's own folder).

import { LINE_MARKER } from '../applier.js';
import { textOn } from '../color.js';

export const STYLESHEET = 'chromancy-theming.css';

/** @returns {string} a file:// URL for an absolute path, each segment percent-encoded */
export function fileUrl(path) {
    return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** [libadwaita variable stem, background role, text role] */
const SURFACES = [
    ['window', 'surface', 'on-surface'],
    ['view', 'surface', 'on-surface'],
    ['headerbar', 'surface-container', 'on-surface'],
    ['sidebar', 'surface-container', 'on-surface'],
    ['secondary-sidebar', 'surface', 'on-surface'],
    ['card', 'surface-container', 'on-surface'],
    ['dialog', 'surface-container', 'on-surface'],
    ['popover', 'surface-container', 'on-surface'],
    ['thumbnail', 'surface-container', 'on-surface'],
    ['overview', 'surface-container', 'on-surface'],
    ['active-toggle', 'hover', 'on-hover'],
];
const SEMANTIC = ['destructive', 'success', 'warning', 'error'];

/** @param {ReturnType<import('../derive.js').resolvePalette>} palette */
export function stylesheet(palette) {
    const c = palette.colors;
    const own = [c['on-surface'], c.surface];
    const vars = [
        ['--accent-bg-color', c.primary],
        ['--accent-fg-color', c['on-primary']],
        // libadwaita's own rule for the standalone accent; Ubuntu's stylesheet replaces it with a fixed color.
        ['--accent-color', 'oklab(from var(--accent-bg-color) var(--standalone-color-oklab))'],
        ['--yaru-accent-bg-color', c.primary],
    ];
    const named = [['accent_bg_color', c.primary], ['accent_fg_color', c['on-primary']], ['accent_color', c.primary]];
    for (const [stem, bg, fg] of SURFACES) {
        vars.push([`--${stem}-bg-color`, c[bg]], [`--${stem}-fg-color`, c[fg]]);
        named.push([`${stem.replace(/-/g, '_')}_bg_color`, c[bg]], [`${stem.replace(/-/g, '_')}_fg_color`, c[fg]]);
    }
    vars.push(
        ['--headerbar-backdrop-color', c.surface],
        ['--sidebar-backdrop-color', c.surface],
        ['--secondary-sidebar-backdrop-color', c.surface],
        ['--sidebar-border-color', c['outline-variant']],
        ['--secondary-sidebar-border-color', c['outline-variant']],
        ['--border-color', c['outline-variant']],
    );
    // libadwaita draws list separators and edge shades with dark translucent overlays, which vanish on
    // very dark surfaces; the outline color shows on any palette.
    for (const stem of ['card', 'popover', 'headerbar', 'sidebar', 'secondary-sidebar'])
        vars.push([`--${stem}-shade-color`, `${c['outline-variant'].slice(0, 7)}99`]);
    for (const role of SEMANTIC) {
        if (c[role] === undefined)
            continue;
        const fg = textOn(c[role], own);
        vars.push([`--${role}-bg-color`, c[role]], [`--${role}-fg-color`, fg]);
        named.push([`${role}_bg_color`, c[role]], [`${role}_fg_color`, fg]);
    }
    return [
        `/* Chromancy Theming: palette "${palette.name}". Rewritten on every Apply. */`,
        '',
        ...named.map(([n, v]) => `@define-color ${n} ${v};`),
        '',
        ':root {',
        ...vars.map(([n, v]) => `  ${n}: ${v};`),
        '}',
        '',
    ].join('\n');
}

export const gtk4 = {
    id: 'gtk4',
    title: 'GTK 4 and libadwaita apps',
    lock: 'none',
    /** @param {{paths: {config: string}}} ctx */
    plan(palette, { paths }) {
        const dir = `${paths.config}/gtk-4.0`;
        return [
            { target: 'gtk4', kind: 'file', path: `${dir}/${STYLESHEET}`, content: stylesheet(palette) },
            { target: 'gtk4', kind: 'line', path: `${dir}/gtk.css`, line: `@import url("${fileUrl(`${dir}/${STYLESHEET}`)}"); ${LINE_MARKER}` },
        ];
    },
};
