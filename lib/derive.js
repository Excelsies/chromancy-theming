// Fills in the color roles a palette leaves out, from its surface, on-surface and primary.

import { contrast, mix, relativeLuminance, textOn } from './color.js';
import { ACCENT_ROLES } from './palette.js';

/**
 * [text, fill, minimum ratio]: the pairs every palette should meet; misses are warnings. Secondary and
 * tertiary, when present, are held to 4.5:1 with their text colors as well.
 */
export const CONTRAST_FLOOR = Object.freeze([
    ['on-primary', 'primary', 4.5],
    ['on-surface', 'surface', 4.5],
    ['on-hover', 'hover', 4.5],
    ['on-surface', 'surface-container', 4.5],
    ['on-surface-variant', 'surface', 3.0],
]);

// Steps from surface toward on-surface.
const STEP = { 'surface-container': 0.07, 'hover': 0.12, 'outline-variant': 0.16, 'on-surface-variant': 0.55 };

function secondaryText(surface, onSurface) {
    for (let t = STEP['on-surface-variant']; t < 1; t += 0.05) {
        const c = mix(surface, onSurface, t);
        if (contrast(c, surface) >= 3)
            return c;
    }
    return onSurface;
}

/**
 * @param {ReturnType<import('./palette.js').parsePalette>} palette
 * @returns {{id: string, name: string, variant: 'dark' | 'light', colors: Record<string, string>,
 *   terminal: object | null, fonts: object | null, derived: string[], warnings: string[]}}
 */
export function resolvePalette(palette) {
    const given = palette.colors;
    const colors = { ...given };
    const surface = given.surface, onSurface = given['on-surface'];
    const own = [onSurface, surface];

    const fill = (role, make) => {
        if (colors[role] === undefined)
            colors[role] = make();
    };
    fill('surface-container', () => mix(surface, onSurface, STEP['surface-container']));
    fill('hover', () => mix(surface, onSurface, STEP.hover));
    fill('outline-variant', () => mix(surface, onSurface, STEP['outline-variant']));
    fill('on-surface-variant', () => secondaryText(surface, onSurface));
    fill('on-primary', () => textOn(colors.primary, own));
    fill('on-hover', () => textOn(colors.hover, own));
    for (const role of ACCENT_ROLES) {
        if (colors[role] !== undefined)
            fill(`on-${role}`, () => textOn(colors[role], own));
    }

    const variant = palette.variant
        ?? (relativeLuminance(surface) < relativeLuminance(onSurface) ? 'dark' : 'light');

    const warnings = [];
    const accentFloor = ACCENT_ROLES.filter(r => colors[r] !== undefined).map(r => [`on-${r}`, r, 4.5]);
    for (const [fg, bg, min] of [...CONTRAST_FLOOR, ...accentFloor]) {
        const ratio = contrast(colors[fg], colors[bg]);
        if (ratio < min)
            warnings.push(`${fg} on ${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`);
    }

    return {
        id: palette.id,
        name: palette.name,
        variant,
        colors,
        terminal: palette.terminal,
        fonts: palette.fonts,
        derived: Object.keys(colors).filter(role => given[role] === undefined),
        warnings,
    };
}
