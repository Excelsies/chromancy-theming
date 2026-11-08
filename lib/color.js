// sRGB colors as hex strings: parsing, mixing and WCAG 2.x contrast.

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * @param {unknown} value
 * @returns {{r: number, g: number, b: number, a: number} | null} channels 0-255, alpha 0-1
 */
export function parseColor(value) {
    if (typeof value !== 'string' || !HEX.test(value))
        return null;
    let hex = value.slice(1);
    if (hex.length === 3)
        hex = [...hex].map(c => c + c).join('');
    const byte = i => parseInt(hex.slice(i, i + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: hex.length === 8 ? byte(6) / 255 : 1 };
}

const pad = n => Math.round(n).toString(16).padStart(2, '0');

/** @returns {string} `#rrggbb`, or `#rrggbbaa` when not opaque */
export function formatColor({ r, g, b, a = 1 }) {
    const rgb = `#${pad(r)}${pad(g)}${pad(b)}`;
    return a >= 1 ? rgb : `${rgb}${pad(a * 255)}`;
}

/** @returns {string | null} the color in canonical form, or null when it does not parse */
export function normalizeColor(value) {
    const c = parseColor(value);
    return c ? formatColor(c) : null;
}

function toColor(value) {
    const c = typeof value === 'string' ? parseColor(value) : value;
    if (!c)
        throw new TypeError(`not a color: ${JSON.stringify(value)}`);
    return c;
}

/** Alpha-composites `fg` over an opaque `bg`. */
function over(fg, bg) {
    const { a } = fg;
    return {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
        a: 1,
    };
}

function luminance({ r, g, b }) {
    const lin = v => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** @returns {number} relative luminance of an opaque color, 0-1 */
export function relativeLuminance(value) {
    return luminance(toColor(value));
}

/**
 * WCAG 2.x contrast ratio. A translucent foreground is composited over the background first;
 * the background's own alpha is ignored.
 */
export function contrast(fg, bg) {
    const back = { ...toColor(bg), a: 1 };
    const front = over(toColor(fg), back);
    const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** @returns {string} `a` moved a fraction `t` (0-1) toward `b`, per channel in sRGB */
export function mix(a, b, t) {
    const x = toColor(a), y = toColor(b);
    const at = k => x[k] + (y[k] - x[k]) * t;
    return formatColor({ r: at('r'), g: at('g'), b: at('b'), a: at('a') });
}

/**
 * Text color for a fill: of the palette's own text colors, the one with the best contrast if it
 * reaches 4.5:1; otherwise black or white, whichever contrasts more.
 * @param {string} fill
 * @param {string[]} own
 */
export function textOn(fill, own) {
    const best = list => list.reduce((p, c) => (contrast(c, fill) > contrast(p, fill) ? c : p));
    const pick = best(own);
    if (contrast(pick, fill) >= 4.5)
        return normalizeColor(pick);
    return best(['#000000', '#ffffff']);
}
