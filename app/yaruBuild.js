// Builds Yaru's GTK 3 and GNOME Shell stylesheets from the vendored source with a palette, the way
// Yaru's own meson build does: copy the sources, apply lib/yaru.js's transforms, run sassc.
// With `palette: null` it builds Yaru's own dark purple theme, which must equal the installed one;
// the tests use that to prove the pipeline.

import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
    ACCENT_ASSETS, YaruBuildError, colorizeSvg, dummySvg, gtk3Entry, gtk3Variables, markDefaults, parseYaruColors,
    patchGtk3ButtonText, patchSassUtils, pngSize, preprocessShellScss, replaceShellAccent, shellEntry, shellVariables,
} from '../lib/yaru.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

const SASSC_TIMEOUT_S = 60;

const decoder = new TextDecoder();
const read = path => decoder.decode(GLib.file_get_contents(path)[1]);
const write = (path, text) => {
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
    GLib.file_set_contents(path, text);
};

/** Every file under `dir` (relative paths) whose name passes `keep`. */
function listFiles(dir, keep, prefix = '') {
    const out = [];
    const enumerator = Gio.File.new_for_path(`${dir}/${prefix}`).enumerate_children('standard::name,standard::type',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    for (let info; (info = enumerator.next_file(null));) {
        const rel = prefix ? `${prefix}/${info.get_name()}` : info.get_name();
        if (info.get_file_type() === Gio.FileType.DIRECTORY)
            out.push(...listFiles(dir, keep, rel));
        else if (keep(rel))
            out.push(rel);
    }
    return out;
}

const isScss = rel => rel.endsWith('.scss');

/** Yaru's shared SCSS (vendor/yaru/common) with optimize-contrast() patched; returns its directory. */
function prepareCommon(vendorDir, workDir) {
    const dir = `${workDir}/common`;
    for (const rel of listFiles(`${vendorDir}/common`, isScss)) {
        const text = read(`${vendorDir}/common/${rel}`);
        write(`${dir}/${rel}`, rel === 'sass-utils.scss' ? patchSassUtils(text) : text);
    }
    return dir;
}

/** Runs sassc; resolves to the CSS or throws YaruBuildError with the compiler's own message. */
export async function sassc(entry, out, includes, { program = 'sassc', timeoutS = SASSC_TIMEOUT_S } = {}) {
    await runTool([program, '-a', ...includes.flatMap(i => ['-I', i]), entry, out], { timeoutS,
        missing: `install it with: sudo apt install sassc` });
    return read(out);
}

/** Runs a program to completion; throws YaruBuildError with its own message when it fails. */
async function runTool(argv, { timeoutS = SASSC_TIMEOUT_S, missing = '' } = {}) {
    const program = argv[0];
    let proc;
    try {
        proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_PIPE);
    } catch (e) {
        throw new YaruBuildError(`cannot run ${program}: ${e.message}${missing ? ` (${missing})` : ''}`);
    }
    let timedOut = false;
    const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeoutS, () => {
        timedOut = true;
        proc.force_exit();
        return GLib.SOURCE_REMOVE;
    });
    let stderr;
    try {
        [, stderr] = await proc.communicate_utf8_async(null, null);
    } finally {
        if (!timedOut)
            GLib.source_remove(timer);
    }
    if (timedOut)
        throw new YaruBuildError(`${program} did not finish within ${timeoutS} s`);
    if (!proc.get_successful()) {
        const message = (stderr ?? '').split('\n').filter(l => l.trim() && !/^(DEBUG|DEPRECATION)/.test(l)).slice(0, 12);
        throw new YaruBuildError(`${program} failed: ${message.join('\n')}`);
    }
}

/** The size of an installed Yaru image, from the theme's resource bundle, or null. */
function installedSize(gtkTheme, file) {
    if (!gtkTheme)
        return null;
    try {
        const resource = Gio.Resource.load(`/usr/share/themes/${gtkTheme}/gtk-3.0/gtk.gresource`);
        return pngSize(resource.lookup_data(`/com/ubuntu/themes/${gtkTheme}/3.0/assets/${file}`, 0).toArray());
    } catch {
        return null;
    }
}

/** librsvg's bindings, or null where they are not installed. */
async function loadRsvg() {
    try {
        return (await import('gi://Rsvg?version=2.0')).default;
    } catch {
        return null;
    }
}

/**
 * Renders Yaru's accent images (ACCENT_ASSETS, at 1x and @2) the way Yaru's build does: assets.svg with
 * the theme colors swapped for placeholders, the placeholders filled from the compiled color table, each
 * image rendered from its element (librsvg, in process; Yaru's build uses Inkscape) at the installed
 * image's size, stretched to it as rsvg-convert -w -h does.
 * @returns {Promise<{assets: Record<string, string>, assetsWarning?: string}>} file name -> PNG, base64
 */
async function renderAccentAssets(entry, { vendorDir, workDir, includes, dark, gtkTheme }) {
    const Rsvg = await loadRsvg();
    if (!Rsvg)
        return { assets: {}, assetsWarning: 'librsvg\u2019s bindings are not installed (sudo apt install gir1.2-rsvg-2.0), so the 12 accent images keep Yaru\u2019s colors' };
    write(`${workDir}/colors-entry.scss`, entry);
    const colors = parseYaruColors(await sassc(`${workDir}/colors-entry.scss`, `${workDir}/colors.css`, includes));
    const svg = new TextEncoder().encode(colorizeSvg(dummySvg(read(`${vendorDir}/gtk/src/default/gtk-3.0/assets.svg`), dark), colors));
    let handle;
    try {
        handle = Rsvg.Handle.new_from_data(svg);
    } catch (e) {
        throw new YaruBuildError(`the accent images could not be read: ${e.message}`);
    }
    const assets = {};
    for (const id of ACCENT_ASSETS) {
        const [found, ink] = handle.get_geometry_for_element(`#${id}`);
        if (!found || !(ink.width > 0 && ink.height > 0))
            throw new YaruBuildError(`assets.svg has no image ${id}`);
        for (const scale of [1, 2]) {
            const file = `${id}${scale === 2 ? '@2' : ''}.png`;
            const size = installedSize(gtkTheme, file) ?? { width: Math.ceil(ink.width * scale), height: Math.ceil(ink.height * scale) };
            const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, size.width, size.height);
            const cr = new Cairo.Context(surface);
            cr.scale(size.width / ink.width, size.height / ink.height);
            handle.render_element(cr, `#${id}`, new Rsvg.Rectangle({ x: 0, y: 0, width: ink.width, height: ink.height }));
            cr.$dispose();
            const out = `${workDir}/${file}`;
            surface.writeToPNG(out);
            surface.finish();
            assets[file] = GLib.base64_encode(GLib.file_get_contents(out)[1]);
        }
    }
    return { assets };
}

/**
 * @param {object | null} palette a resolved palette, or null for Yaru's own dark purple theme
 * @param {{vendorDir: string, workDir: string, gtkTheme?: string, program?: string}} ctx gtkTheme: the
 *   installed Yaru theme whose image sizes the rendered images match
 * @returns {Promise<{css: string, assets: Record<string, string>, assetsWarning?: string}>}
 */
export async function buildGtk3(palette, { vendorDir, workDir, gtkTheme, program }) {
    const srcDir = `${vendorDir}/gtk/src/default/gtk-3.0`;
    const copy = `${workDir}/gtk3`;
    for (const rel of listFiles(srcDir, isScss))
        write(`${copy}/${rel}`, read(`${srcDir}/${rel}`));
    const dark = palette ? palette.variant === 'dark' : true;
    const entryPoint = `${copy}/${dark ? 'gtk-dark' : 'gtk'}.scss`;
    const template = read(`${vendorDir}/common/accent-colors.scss.in`);
    let entry;
    if (palette) {
        const names = Object.keys(gtk3Variables(palette));
        const { text, counts } = markDefaults(read(`${copy}/_colors.scss`), names);
        for (const n of names) {
            if (counts[n] !== 1)
                throw new YaruBuildError(`GTK 3 _colors.scss defines $${n} ${counts[n]} times, expected 1`);
        }
        write(`${copy}/_colors.scss`, text);
        const buttons = patchGtk3ButtonText(read(`${copy}/_common.scss`));
        if (buttons.count === 0)
            throw new YaruBuildError('GTK 3 _common.scss no longer passes white as button text; the patch needs updating');
        write(`${copy}/_common.scss`, buttons.text);
        entry = gtk3Entry(template, palette, entryPoint);
    } else {
        entry = template.replace('@yaru_dark_variant@', 'true').replace('@yaru_accent_color@', 'purple')
            .replace('@yaru_theme_entry_point@', entryPoint);
    }
    write(`${workDir}/gtk3-entry.scss`, entry);
    const common = prepareCommon(vendorDir, workDir);
    // The color table is the same entry with Yaru's color definitions in place of the theme. The theme and
    // the images build at the same time; both are waited for, so nothing is still running if one fails.
    const colorsEntry = entry.split(entryPoint).join(`${common}/yaru-colors-defs.scss`);
    const [css, images] = await Promise.allSettled([
        sassc(`${workDir}/gtk3-entry.scss`, `${workDir}/gtk3.css`, [common, copy], { program }),
        renderAccentAssets(colorsEntry, { vendorDir, workDir, includes: [common, copy], dark, gtkTheme }),
    ]);
    for (const r of [css, images]) {
        if (r.status === 'rejected')
            throw r.reason;
    }
    return { css: css.value, ...images.value };
}

/**
 * @param {object | null} palette a resolved palette, or null for Yaru's own dark theme
 * @param {{vendorDir: string, workDir: string, program?: string}} ctx
 * @returns {Promise<{css: string, accentReplaced: number}>}
 */
export async function buildShell(palette, { vendorDir, workDir, program }) {
    const shellDir = `${workDir}/shell`;
    const roots = [['gnome-shell/src', 'src'], ['gnome-shell/upstream/theme', 'upstream/theme']];
    const names = palette ? Object.keys(shellVariables(palette)) : [];
    const total = Object.fromEntries(names.map(n => [n, 0]));
    for (const [from, to] of roots) {
        for (const rel of listFiles(`${vendorDir}/${from}`, isScss)) {
            let text = preprocessShellScss(read(`${vendorDir}/${from}/${rel}`));
            if (names.length) {
                const marked = markDefaults(text, names);
                text = marked.text;
                for (const [n, c] of Object.entries(marked.counts))
                    total[n] += c;
            }
            write(`${shellDir}/${to}/${rel}`, text);
        }
    }
    for (const n of names) {
        if (total[n] < 1)
            throw new YaruBuildError(`the shell sources do not define $${n}`);
    }
    const template = read(`${vendorDir}/gnome-shell/src/gnome-shell.scss.in`);
    const entry = palette
        ? shellEntry(template, palette)
        : template.replace('@Variant@', 'dark').replace('@UseGResource@', 'true').replace('@Contrast@', 'normal')
            .replace('@Colors@', 'colors');
    write(`${shellDir}/entry.scss`, entry);
    const common = prepareCommon(vendorDir, workDir);
    const compiled = await sassc(`${shellDir}/entry.scss`, `${workDir}/shell.css`,
        [`${shellDir}/src`, common, `${shellDir}/src/gnome-shell-sass`, `${shellDir}/upstream/theme`], { program });
    if (!palette)
        return { css: compiled, accentReplaced: 0 };
    const { css, count } = replaceShellAccent(compiled, palette.colors.primary, palette.colors['on-primary']);
    return { css, accentReplaced: count };
}
