// The palette file format: parsing and validation. A palette is JSON:
//
//   {
//     "name": "Jeweltone",
//     "variant": "dark",                       optional; else from surface vs on-surface
//     "colors": { "primary": "#e3c078", ... },  primary, surface, on-surface required
//     "terminal": { "background", "foreground", "cursor", "cursor-text", "ansi": [16 colors] },   optional
//     "fonts": { "interface", "document", "monospace" }                           optional
//   }
//
// Colors are #rgb, #rrggbb or #rrggbbaa. Unknown keys are refused so a typo is reported
// instead of silently ignored. Every error names the key it is about.

import { normalizeColor } from './color.js';

/** The UI color roles, shared with Conjure Launcher's theme tokens. */
export const COLOR_ROLES = Object.freeze(['primary', 'on-primary', 'surface', 'surface-container', 'on-surface',
    'on-surface-variant', 'outline-variant', 'hover', 'on-hover']);
const REQUIRED_ROLES = Object.freeze(['primary', 'surface', 'on-surface']);
/** Optional extra accents, each with its text color; a text color needs its accent. */
export const ACCENT_ROLES = Object.freeze(['secondary', 'tertiary']);
/** Optional, never derived: the border of unfocused windows (Plaid uses outline-variant without it). */
export const BORDER_ROLES = Object.freeze(['inactive-border']);
/** Optional; when absent the system's own values stay. */
export const SEMANTIC_ROLES = Object.freeze(['destructive', 'success', 'warning', 'error']);
export const FONT_ROLES = Object.freeze(['interface', 'document', 'monospace']);
const VARIANTS = Object.freeze(['dark', 'light']);

const TOP_KEYS = ['name', 'variant', 'colors', 'terminal', 'fonts'];
const TERMINAL_KEYS = ['background', 'foreground', 'cursor', 'cursor-text', 'ansi'];
const ID = /^[a-z0-9][a-z0-9-]*$/;
// Pango font description: family (and optional style words), then a size in points.
const FONT = /^\S.*\s\d+(?:\.\d+)?$/;

export class PaletteError extends Error {
    /** @param {string} path the key the error is about, e.g. `colors.primary` */
    constructor(path, message) {
        super(`${path}: ${message}`);
        this.name = 'PaletteError';
        this.path = path;
    }
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function refuseUnknown(obj, allowed, prefix) {
    for (const key of Object.keys(obj)) {
        if (!allowed.includes(key))
            throw new PaletteError(`${prefix}${key}`, 'unknown key');
    }
}

function color(value, path) {
    const c = normalizeColor(value);
    if (!c)
        throw new PaletteError(path, `expected #rgb, #rrggbb or #rrggbbaa, got ${JSON.stringify(value)}`);
    return c;
}

function parseColors(obj) {
    if (!isObject(obj))
        throw new PaletteError('colors', 'expected an object');
    refuseUnknown(obj, [...COLOR_ROLES, ...ACCENT_ROLES.flatMap(r => [r, `on-${r}`]), ...BORDER_ROLES, ...SEMANTIC_ROLES], 'colors.');
    for (const role of REQUIRED_ROLES) {
        if (obj[role] === undefined)
            throw new PaletteError(`colors.${role}`, 'required');
    }
    for (const role of ACCENT_ROLES) {
        if (obj[`on-${role}`] !== undefined && obj[role] === undefined)
            throw new PaletteError(`colors.on-${role}`, `given without colors.${role}`);
    }
    const out = {};
    for (const [role, value] of Object.entries(obj))
        out[role] = color(value, `colors.${role}`);
    return out;
}

function parseTerminal(obj) {
    if (!isObject(obj))
        throw new PaletteError('terminal', 'expected an object');
    refuseUnknown(obj, TERMINAL_KEYS, 'terminal.');
    for (const key of ['background', 'foreground']) {
        if (obj[key] === undefined)
            throw new PaletteError(`terminal.${key}`, 'required');
    }
    if (!Array.isArray(obj.ansi) || obj.ansi.length !== 16)
        throw new PaletteError('terminal.ansi', 'expected an array of 16 colors');
    const out = {
        background: color(obj.background, 'terminal.background'),
        foreground: color(obj.foreground, 'terminal.foreground'),
        ansi: obj.ansi.map((c, i) => color(c, `terminal.ansi[${i}]`)),
    };
    for (const key of ['cursor', 'cursor-text']) {
        if (obj[key] !== undefined)
            out[key] = color(obj[key], `terminal.${key}`);
    }
    return out;
}

function parseFonts(obj) {
    if (!isObject(obj))
        throw new PaletteError('fonts', 'expected an object');
    refuseUnknown(obj, FONT_ROLES, 'fonts.');
    const out = {};
    for (const [role, value] of Object.entries(obj)) {
        if (typeof value !== 'string' || !FONT.test(value.trim()))
            throw new PaletteError(`fonts.${role}`, `expected a font and size such as "Ubuntu Sans 11", got ${JSON.stringify(value)}`);
        out[role] = value.trim();
    }
    return out;
}

/**
 * @param {string} id the palette's file name without `.json`
 * @param {unknown} obj the parsed JSON
 * @returns {{id: string, name: string, variant: string | null, colors: Record<string, string>,
 *   terminal: object | null, fonts: Record<string, string> | null}}
 * @throws {PaletteError}
 */
export function parsePalette(id, obj) {
    if (typeof id !== 'string' || !ID.test(id))
        throw new PaletteError('id', `expected lowercase letters, digits and dashes, got ${JSON.stringify(id)}`);
    if (!isObject(obj))
        throw new PaletteError('(palette)', 'expected an object');
    refuseUnknown(obj, TOP_KEYS, '');
    if (typeof obj.name !== 'string' || !obj.name.trim())
        throw new PaletteError('name', 'required');
    if (obj.variant !== undefined && !VARIANTS.includes(obj.variant))
        throw new PaletteError('variant', `expected "dark" or "light", got ${JSON.stringify(obj.variant)}`);
    return {
        id,
        name: obj.name.trim(),
        variant: obj.variant ?? null,
        colors: parseColors(obj.colors),
        terminal: obj.terminal === undefined ? null : parseTerminal(obj.terminal),
        fonts: obj.fonts === undefined ? null : parseFonts(obj.fonts),
    };
}
