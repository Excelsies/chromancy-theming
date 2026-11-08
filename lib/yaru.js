// Rebuilding Yaru (Ubuntu's GTK 3 and GNOME Shell theme) with a palette: the text transforms.
// app/yaruBuild.js copies the vendored source, applies these and runs sassc.
//
// Yaru derives every shade from a few base variables, but assigns them without !default, so a value
// set before its import would be overwritten. The build marks each definition of the variables
// Chromancy sets as !default and defines them first; everything Yaru derives from them follows.
// Variables Chromancy does not set are left as Yaru wrote them.

import { textOn } from './color.js';

export class YaruBuildError extends Error {
    constructor(message) {
        super(`Yaru build: ${message}`);
        this.name = 'YaruBuildError';
    }
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Adds !default to every top-level definition of the named variables.
 * @returns {{text: string, counts: Record<string, number>}} definitions marked per variable
 * @throws {YaruBuildError} when a definition does not end on its own line
 */
export function markDefaults(scss, names) {
    const counts = Object.fromEntries(names.map(n => [n, 0]));
    const lines = scss.split('\n').map(line => {
        for (const name of names) {
            const head = new RegExp(`^\\$${escape(name)}\\s*:`);
            if (!head.test(line))
                continue;
            const m = /^(.*?);(\s*(?:\/\/.*)?)$/.exec(line);
            if (!m)
                throw new YaruBuildError(`$${name} is not defined on one line: ${JSON.stringify(line)}`);
            counts[name]++;
            return `${m[1]} !default;${m[2]}`;
        }
        return line;
    });
    return { text: lines.join('\n'), counts };
}

/** One SCSS assignment per variable. */
export function overrideBlock(vars) {
    return Object.entries(vars).map(([k, v]) => `$${k}: ${v};\n`).join('');
}

const SEMANTIC = ['warning', 'error', 'success', 'destructive'];

/** Yaru GTK 3 base variables from a resolved palette. */
export function gtk3Variables(palette) {
    const c = palette.colors;
    const vars = {
        bg_color: c.surface,
        fg_color: c['on-surface'],
        base_color: c['surface-container'],
        text_color: c['on-surface'],
        headerbar_color: c['surface-container'],
        menu_color: c['surface-container'],
    };
    for (const role of SEMANTIC) {
        if (c[role] !== undefined)
            vars[`${role}_color`] = c[role];
    }
    return vars;
}

/** Yaru shell base variables from a resolved palette. */
export function shellVariables(palette) {
    const c = palette.colors;
    const vars = {
        bg_color: c.surface,
        fg_color: c['on-surface'],
        base_color: c['surface-container'],
        panel_bg_color: c.surface,
        panel_fg_color: c['on-surface'],
        card_bg_color: c['surface-container'],
        hover_bg_color: c.hover,
        hover_fg_color: c['on-hover'],
        osd_bg_color: c['surface-container'],
        osd_fg_color: c['on-surface'],
    };
    for (const role of SEMANTIC) {
        if (c[role] === undefined)
            continue;
        vars[`${role}_bg_color`] = c[role];
        // Yaru already derives the warning text color from its background (optimize-contrast).
        if (role !== 'warning')
            vars[`${role}_fg_color`] = textOn(c[role], [c['on-surface'], c.surface]);
    }
    return vars;
}

function replaceOnce(text, from, to, what) {
    const n = text.split(from).length - 1;
    if (n !== 1)
        throw new YaruBuildError(`${what}: expected 1 occurrence of ${JSON.stringify(from)}, found ${n}`);
    return text.replace(from, () => to);
}

/**
 * The GTK 3 entry file: Yaru's accent-colors.scss.in with the palette's accent and background,
 * the base variable overrides, then the theme import.
 */
export function gtk3Entry(template, palette, entryPoint) {
    const c = palette.colors;
    const dark = palette.variant === 'dark';
    let s = template;
    s = replaceOnce(s, '@yaru_dark_variant@', String(dark), 'accent-colors.scss.in');
    s = replaceOnce(s, "$yaru_accent_bg_color: get_accent_color('@yaru_accent_color@', $yaru_is_dark_variant);",
        `$yaru_accent_bg_color: ${c.primary};`, 'accent-colors.scss.in');
    s = replaceOnce(s, '$accent_fg_color: white;', `$accent_fg_color: ${c['on-primary']};`, 'accent-colors.scss.in');
    s = replaceOnce(s, '$yaru_dark_bg: lighten($jet, 8%);', `$yaru_dark_bg: ${dark ? c.surface : 'lighten($jet, 8%)'};`,
        'accent-colors.scss.in');
    s = replaceOnce(s, '$yaru_light_bg: #FAFAFA;', `$yaru_light_bg: ${dark ? '#FAFAFA' : c.surface};`, 'accent-colors.scss.in');
    s = replaceOnce(s, "@import '@yaru_theme_entry_point@'",
        `${overrideBlock(gtk3Variables(palette))}@import '${entryPoint}'`, 'accent-colors.scss.in');
    return s;
}

/** The shell entry file: Yaru's gnome-shell.scss.in for the palette's variant, with the overrides. */
export function shellEntry(template, palette) {
    let s = template;
    s = replaceOnce(s, '@Variant@', palette.variant, 'gnome-shell.scss.in');
    s = replaceOnce(s, '@UseGResource@', 'true', 'gnome-shell.scss.in');
    s = replaceOnce(s, '@Contrast@', 'normal', 'gnome-shell.scss.in');
    s = replaceOnce(s, '@import "gnome-shell-sass/_@Colors@";',
        `${overrideBlock(shellVariables(palette))}@import "gnome-shell-sass/_colors";`, 'gnome-shell.scss.in');
    return s;
}

/** What Yaru's shell build does to each source file before compiling. */
export function preprocessShellScss(text) {
    return text
        .replace(/[ \t\n\r\f\v]*url[ \t\n\r\f\v]*\(/g, ' yaru_url_handler(')
        .replace(/'(_default-colors(\.scss)?)'/g, "'_yaru-default-colors.scss'");
}

/** The shell reads its accent at runtime; the rebuilt theme uses the palette's instead. */
export function replaceShellAccent(css, primary, onPrimary) {
    let count = 0;
    const out = css
        .replace(/-st-accent-fg-color/g, () => {
            count++;
            return onPrimary;
        })
        .replace(/-st-accent-color/g, () => {
            count++;
            return primary;
        });
    return { css: out, count };
}

const CONTRAST_ERROR = `    @if (color-contrast($bg, $boundary-fg) < $target) {
        @error "Cannot reach contrast target " + $target + " for " +
            $fg + " on " + $bg;
    }`;
const CONTRAST_FALLBACK = `    @if (color-contrast($bg, $boundary-fg) < $target) {
        // Chromancy: a palette accent can be darker or lighter than any Yaru accent, so try the
        // other direction, and return the closest color rather than stopping the build.
        $dark-bg: not $dark-bg;
        $lo: if($dark-bg, nth($fg-oklab, 1), 0);
        $hi: if($dark-bg, 1, nth($fg-oklab, 1));
        $other-fg: oklab-to-srgb(if($dark-bg, $hi, $lo), $fg-a, $fg-b);
        @if (color-contrast($bg, $other-fg) < $target) {
            @return if(color-contrast($bg, $other-fg) > color-contrast($bg, $boundary-fg), $other-fg, $boundary-fg);
        }
    }`;

/**
 * Yaru's optimize-contrast() searches only one direction and raises an error when the target is out
 * of reach there. Yaru's own accents never reach that branch; the patch only changes what happens in it.
 */
export function patchSassUtils(text) {
    return replaceOnce(text, CONTRAST_ERROR, CONTRAST_FALLBACK, 'sass-utils.scss');
}

/** Reads vendor/yaru/SOURCE (`key: value` lines). */
export function parseSource(text) {
    const out = {};
    for (const line of text.split('\n')) {
        const m = /^(\w+):\s*(.+)$/.exec(line.trim());
        if (m)
            out[m[1]] = m[2];
    }
    return out;
}
