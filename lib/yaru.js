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
    if (palette.variant === 'dark') {
        // Yaru's dark variant builds unfocused-window text from white; same formula, palette text.
        vars.backdrop_fg_color = `transparentize(${c['on-surface']}, 0.35)`;
        vars.backdrop_text_color = `transparentize(${c['on-surface']}, 0.45)`;
    }
    return vars;
}

/**
 * Yaru passes white as the text color of suggested and destructive buttons, which only suits its own
 * accents. Routes it through chromancy-text-on(), defined by gtk3Entry().
 * @returns {{text: string, count: number}}
 */
export function patchGtk3ButtonText(text) {
    let count = 0;
    const out = text.replace(/\$b_color, white\)/g, () => {
        count++;
        return '$b_color, chromancy-text-on($b_color))';
    });
    return { text: out, count };
}

function textOnFunction(palette) {
    const c = palette.colors;
    const destructive = c.destructive ? textOn(c.destructive, [c['on-surface'], c.surface]) : 'white';
    return [
        '@function chromancy-text-on($c) {',
        `    @if $c == $suggested_bg_color { @return ${c['on-primary']}; }`,
        `    @return ${destructive};`,
        '}',
        '',
    ].join('\n');
}

/** Yaru shell base variables from a resolved palette. */
export function shellVariables(palette) {
    const c = palette.colors;
    // Yaru keeps the panel, the dock and the overview dark in both variants: they take the palette's
    // dark color with its light one as text.
    const [darkColor, lightColor] = palette.variant === 'dark' ? [c.surface, c['on-surface']] : [c['on-surface'], c.surface];
    const vars = {
        bg_color: c.surface,
        fg_color: c['on-surface'],
        base_color: c['surface-container'],
        panel_bg_color: darkColor,
        panel_fg_color: lightColor,
        yaru_panel_bg_color: darkColor,
        yaru_panel_fg_color: lightColor,
        system_base_color: darkColor,
        system_bg_color: `mix(${lightColor}, ${darkColor}, 7%)`,
        system_fg_color: lightColor,
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
        `${overrideBlock(gtk3Variables(palette))}${textOnFunction(palette)}@import '${entryPoint}'`, 'accent-colors.scss.in');
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

/** Yaru's GTK 3 images drawn with its accent (and their dark variants); the others do not change. */
export const ACCENT_ASSETS = Object.freeze([
    'slider-horz-scale-has-marks-above-active', 'slider-horz-scale-has-marks-above-active-dark',
    'slider-horz-scale-has-marks-below-active', 'slider-horz-scale-has-marks-below-active-dark',
    'slider-vert-scale-has-marks-above-active', 'slider-vert-scale-has-marks-above-active-dark',
    'slider-vert-scale-has-marks-below-active', 'slider-vert-scale-has-marks-below-active-dark',
    'text-select-end-active', 'text-select-end-active-dark', 'text-select-start-active', 'text-select-start-active-dark',
]);

/** Yaru's build: theme colors in assets.svg become placeholder colors (gtk/src/meson.build). */
export function dummySvg(svg, dark) {
    const swaps = [
        [dark ? '#33393b' : '#eeeeec', '#ffff00'],
        ['#e8e6e3', '#fffff1'], ['#343434', '#fffff1'], ['#393939', '#fffff1'],
        ['#e95420', '#00ff01'], ['#2265b5', '#00ff01'], ['#040c18', '#00ff01'],
        ['#1b4f8d', '#00ff05'], ['#07182f', '#00ff05'],
        ['#3465a4', '#00ff03'],
    ];
    return swaps.reduce((text, [from, to]) => text.split(from).join(to), svg);
}

/** The placeholder each Yaru color name stands for (common/colorize-dummy-svg.py). */
const DUMMY_COLORS = {
    'accent-color-base': '#00ff20', 'accent-color-base-hc': '#00ff21', 'accent-color': '#00ff03',
    'accent-color-dark-bg': '#00ff07', 'accent-color-dark-bg-hc': '#00ff08', 'accent-color-light-bg': '#00ff09',
    'accent-color-light-bg-hc': '#00ff10', 'accent-color-hc': '#00ff04', 'accent-bg-color': '#00ff01',
    'accent-bg-color-hc': '#00ff05', 'accent-active-color': '#00ff02', 'accent-active-color-hc': '#00ff06',
    'accent-border-color': '#ff0001', 'accent-border-color-hc': '#ff0002', 'accent-focused-color': '#0101ff',
    'accent-focused-color-hc': '#0101f1', 'accent-color-on-accent-color': '#008502', 'accent-color-on-accent-color-hc': '#008503',
    'bg-color': '#ffff00', 'light-bg-color': '#fffff1', 'dark-bg-color': '#000001', 'border-color': '#ff00ff',
    'border-color-hc': '#ff00f1', 'disabled-bg-color': '#ffff02', 'disabled-bg-color-hc': '#ffff04',
    'switch-bg-color': '#ffff01', 'switch-bg-color-hc': '#ffff05', 'check-bg-color': '#ffff03', 'check-bg-color-hc': '#ffff06',
};

/** The -yaru-<name>: <color> declarations of the compiled common/yaru-colors-defs.scss. */
export function parseYaruColors(css) {
    const out = {};
    for (const m of css.matchAll(/-yaru-([a-z-]+):\s*([^;]+);/g)) {
        if (!m[1].endsWith('-opaque'))
            out[m[1]] = m[2].trim();
    }
    return out;
}

/** Replaces each placeholder with its compiled color. */
export function colorizeSvg(svg, colors) {
    let out = svg;
    for (const [name, color] of Object.entries(colors)) {
        if (DUMMY_COLORS[name])
            out = out.split(DUMMY_COLORS[name]).join(color);
    }
    return out;
}

/** Width and height from a PNG's IHDR chunk, or null when the bytes are not a PNG. */
export function pngSize(bytes) {
    if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[12] !== 73 || bytes[13] !== 72)
        return null;
    const u32 = i => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
    return { width: u32(16), height: u32(20) };
}
