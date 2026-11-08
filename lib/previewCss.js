// CSS for the app's palette swatches and its live preview. Every rule is scoped to a class of its own
// (cp-card-<id>, chromancy-preview), so the app's own look is not affected.

/** Swatch rules for one palette card. */
export function cardCss(palette) {
    const c = palette.colors;
    const id = palette.id;
    const dots = [c.primary, c.secondary ?? c.hover, c.tertiary ?? c['on-surface-variant']];
    return [
        `.cp-card-${id} .cp-swatch { background-color: ${c.surface}; border: 1px solid ${c['outline-variant']}; border-radius: 12px; }`,
        `.cp-card-${id} .cp-swatch-bar { background-color: ${c['surface-container']}; border-radius: 8px; }`,
        `.cp-card-${id} .cp-swatch-text { color: ${c['on-surface']}; }`,
        ...dots.map((d, i) => `.cp-card-${id} .cp-dot-${i} { background-color: ${d}; border-radius: 999px; min-width: 18px; min-height: 18px; }`),
    ].join('\n');
}

/** Rules for the live preview of one palette. */
export function previewCss(palette) {
    const c = palette.colors;
    const p = '.chromancy-preview';
    return [
        `${p} { background-color: ${c.surface}; color: ${c['on-surface']}; border: 1px solid ${c['outline-variant']}; border-radius: 14px; }`,
        `${p} .cp-header { background-color: ${c['surface-container']}; border-bottom: 1px solid ${c['outline-variant']}; border-radius: 14px 14px 0 0; padding: 10px 14px; }`,
        `${p} .cp-sidebar { background-color: ${c['surface-container']}; border-right: 1px solid ${c['outline-variant']}; padding: 8px; border-radius: 0 0 0 14px; }`,
        `${p} .cp-item { padding: 6px 10px; border-radius: 8px; }`,
        `${p} .cp-item-selected { background-color: ${c.hover}; color: ${c['on-hover']}; }`,
        `${p} .cp-card { background-color: ${c['surface-container']}; border-radius: 12px; padding: 4px 0; }`,
        `${p} .cp-row { padding: 8px 14px; }`,
        `${p} .cp-row + .cp-row { border-top: 1px solid ${c['outline-variant']}99; }`,
        `${p} .cp-dim { color: ${c['on-surface-variant']}; }`,
        `${p} .cp-accent { color: ${c.primary}; font-weight: bold; }`,
        `${p} .cp-button { background-color: ${c.primary}; color: ${c['on-primary']}; border-radius: 8px; padding: 6px 14px; font-weight: bold; }`,
        `${p} .cp-button-secondary { background-color: ${c.secondary ?? c['surface-container']}; color: ${c['on-secondary'] ?? c['on-surface']}; border-radius: 8px; padding: 6px 14px; }`,
        `${p} .cp-pill-on { background-color: ${c.primary}; border-radius: 999px; min-width: 40px; min-height: 22px; }`,
        `${p} .cp-pill-on .cp-knob { background-color: ${c['on-primary']}; border-radius: 999px; min-width: 18px; min-height: 18px; margin: 2px; }`,
        `${p} .cp-pill-off { background-color: ${c['outline-variant']}; border-radius: 999px; min-width: 40px; min-height: 22px; }`,
        `${p} .cp-pill-off .cp-knob { background-color: ${c['on-surface']}; border-radius: 999px; min-width: 18px; min-height: 18px; margin: 2px; }`,
        `${p} .cp-error { color: ${c.error ?? c.destructive ?? '#e01b24'}; }`,
    ].join('\n');
}
