// Font names between Pango ("Family [Style...] Size", as GNOME stores them) and other formats.

const STYLES = ['Thin', 'Ultra-Light', 'Extra-Light', 'Light', 'Semi-Light', 'Book', 'Regular', 'Normal', 'Medium',
    'Semi-Bold', 'Demi-Bold', 'Bold', 'Ultra-Bold', 'Extra-Bold', 'Heavy', 'Black', 'Italic', 'Oblique',
    'Condensed', 'Semi-Condensed', 'Expanded', 'Small-Caps'];
const WEIGHTS = { 'Thin': 100, 'Ultra-Light': 200, 'Extra-Light': 200, 'Light': 300, 'Semi-Light': 350, 'Book': 380,
    'Regular': 400, 'Normal': 400, 'Medium': 500, 'Semi-Bold': 600, 'Demi-Bold': 600, 'Bold': 700, 'Ultra-Bold': 800,
    'Extra-Bold': 800, 'Heavy': 900, 'Black': 900 };

function split(desc) {
    const words = desc.trim().split(/\s+/);
    let size = null;
    if (words.length > 1 && /^\d+(\.\d+)?$/.test(words[words.length - 1]))
        size = words.pop();
    const styles = [];
    while (words.length > 1 && STYLES.includes(words[words.length - 1]))
        styles.unshift(words.pop());
    return { family: words.join(' '), styles, size };
}

/** The family of a Pango font description. */
export function pangoFamily(desc) {
    return split(desc).family;
}

/** Qt 6's QFont::toString() for a Pango font description. */
export function qtFont(desc) {
    const { family, styles, size } = split(desc);
    const weight = styles.map(s => WEIGHTS[s]).find(w => w !== undefined) ?? 400;
    const italic = styles.includes('Italic') || styles.includes('Oblique') ? 1 : 0;
    return [family, size ?? '10', -1, 5, weight, italic, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1].join(',');
}
