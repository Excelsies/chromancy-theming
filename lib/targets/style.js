// GNOME's light/dark preference, set from the palette's variant so the shell, libadwaita and apps
// that follow the preference draw their light or dark details to match. GNOME Settings writes
// "default" for Light.

export const style = {
    id: 'style',
    title: 'Light or dark style',
    lock: 'none',
    plan(palette) {
        return [{
            target: 'style', kind: 'setting', schema: 'org.gnome.desktop.interface', key: 'color-scheme',
            value: palette.variant === 'dark' ? 'prefer-dark' : 'default',
        }];
    },
};
