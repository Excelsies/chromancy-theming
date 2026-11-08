// The desktop's interface, document and monospace fonts. GTK, libadwaita, Qt (through its GNOME
// platform theme) and the shell all read these settings. Only the fonts the palette gives are set;
// the others keep their current value.

const SCHEMA = 'org.gnome.desktop.interface';
const KEYS = { interface: 'font-name', document: 'document-font-name', monospace: 'monospace-font-name' };

export const fonts = {
    id: 'fonts',
    title: 'Fonts',
    lock: 'none',
    plan(palette) {
        return Object.entries(KEYS)
            .filter(([role]) => palette.fonts?.[role] !== undefined)
            .map(([role, key]) => ({ target: 'fonts', kind: 'setting', schema: SCHEMA, key, value: palette.fonts[role] }));
    },
};
