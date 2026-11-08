// The app's own settings (~/.config/chromancy-theming/config.json): the selected palette, the one
// last applied, the enabled targets (null: all), chosen fonts that override the palette's, and the
// blacklist (desktop file ids of apps kept out of the theme). A broken
// or partly wrong file never stops the app: each bad field falls back to its default, with a warning.

import { FONT_ROLES } from './palette.js';

export const DEFAULT_CONFIG = Object.freeze({ palette: null, applied: null, targets: null, fonts: Object.freeze({}), blacklist: Object.freeze([]) });

const FONT = /^\S.*\s\d+(?:\.\d+)?$/;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {string | null} text
 * @param {string[]} knownTargets
 * @returns {{config: {palette: string | null, applied: string | null, targets: string[] | null,
 *   fonts: Record<string, string>}, warnings: string[]}}
 */
export function parseConfig(text, knownTargets) {
    const warnings = [];
    const config = { palette: null, applied: null, targets: null, fonts: {}, blacklist: [] };
    if (text === null)
        return { config: { ...DEFAULT_CONFIG }, warnings };
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        return { config: { ...DEFAULT_CONFIG }, warnings: [`config: not valid JSON (${e.message}); using defaults`] };
    }
    if (!isObject(data))
        return { config: { ...DEFAULT_CONFIG }, warnings: ['config: expected an object; using defaults'] };
    for (const key of ['palette', 'applied']) {
        if (data[key] === undefined || data[key] === null)
            continue;
        if (typeof data[key] === 'string')
            config[key] = data[key];
        else
            warnings.push(`config ${key}: expected a palette id`);
    }
    if (Array.isArray(data.targets)) {
        config.targets = data.targets.filter(t => knownTargets.includes(t));
        const unknown = data.targets.filter(t => !knownTargets.includes(t));
        if (unknown.length)
            warnings.push(`config targets: unknown ${unknown.join(', ')}`);
    } else if (data.targets !== undefined && data.targets !== null) {
        warnings.push('config targets: expected a list');
    }
    if (isObject(data.fonts)) {
        for (const [role, value] of Object.entries(data.fonts)) {
            if (FONT_ROLES.includes(role) && typeof value === 'string' && FONT.test(value))
                config.fonts[role] = value;
            else
                warnings.push(`config fonts.${role}: expected a font and size`);
        }
    }
    if (Array.isArray(data.blacklist)) {
        config.blacklist = [...new Set(data.blacklist.filter(id => typeof id === 'string' && /^[^/]+\.desktop$/.test(id)))];
        if (config.blacklist.length !== data.blacklist.length)
            warnings.push('config blacklist: entries must be desktop file ids such as org.gnome.Nautilus.desktop');
    } else if (data.blacklist !== undefined && data.blacklist !== null) {
        warnings.push('config blacklist: expected a list');
    }
    return { config, warnings };
}

export function serializeConfig(config) {
    return `${JSON.stringify(config, null, 2)}\n`;
}

/** The palette with the chosen fonts in place of its own, role by role. */
export function withFonts(palette, fonts) {
    if (!fonts || Object.keys(fonts).length === 0)
        return palette;
    return { ...palette, fonts: { ...(palette.fonts ?? {}), ...fonts } };
}
