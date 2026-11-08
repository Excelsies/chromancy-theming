// Reads Ptyxis terminal palette files (GKeyFile format). A file has a [Palette] group with
// Name and, either in that group or in separate [Light] and [Dark] groups, Background,
// Foreground, an optional Cursor and CursorForeground, and Color0 to Color15.

import { normalizeColor } from './color.js';

function parseGroups(text) {
    const groups = new Map();
    let current = null;
    text.split('\n').forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line.startsWith('#'))
            return;
        const header = /^\[(.+)\]$/.exec(line);
        if (header) {
            current = header[1];
            groups.set(current, new Map());
            return;
        }
        const eq = line.indexOf('=');
        if (eq < 0 || !current)
            throw new Error(`line ${i + 1}: expected [Group] or Key=Value, got ${JSON.stringify(raw)}`);
        groups.get(current).set(line.slice(0, eq).trim(), { value: line.slice(eq + 1).trim(), line: i + 1 });
    });
    return groups;
}

function readVariant(group, name) {
    const get = (key, optional = false) => {
        const entry = group.get(key);
        if (!entry) {
            if (optional)
                return undefined;
            throw new Error(`[${name}] ${key}: missing`);
        }
        const c = normalizeColor(entry.value);
        if (!c)
            throw new Error(`line ${entry.line}: ${key}: not a color: ${JSON.stringify(entry.value)}`);
        return c;
    };
    const out = {
        background: get('Background'),
        foreground: get('Foreground'),
        ansi: Array.from({ length: 16 }, (_, i) => get(`Color${i}`)),
    };
    const cursor = get('Cursor', true);
    if (cursor)
        out.cursor = cursor;
    const cursorText = get('CursorForeground', true);
    if (cursorText)
        out['cursor-text'] = cursorText;
    return out;
}

/**
 * @param {string} text the file's contents
 * @returns {{name: string, light: object, dark: object}} each variant is
 *   `{background, foreground, cursor?, 'cursor-text'?, ansi: string[16]}`, the palette file format's terminal
 */
export function parsePtyxisPalette(text) {
    const groups = parseGroups(text);
    const main = groups.get('Palette');
    if (!main)
        throw new Error('[Palette]: missing');
    const name = main.get('Name')?.value;
    if (!name)
        throw new Error('[Palette] Name: missing');
    if (groups.has('Light') || groups.has('Dark')) {
        return {
            name,
            light: readVariant(groups.get('Light') ?? new Map(), 'Light'),
            dark: readVariant(groups.get('Dark') ?? new Map(), 'Dark'),
        };
    }
    const both = readVariant(main, 'Palette');
    return { name, light: both, dark: { ...both, ansi: [...both.ansi] } };
}
