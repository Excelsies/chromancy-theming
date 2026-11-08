// Builds Yaru's GTK 3 and GNOME Shell stylesheets from the vendored source with a palette, the way
// Yaru's own meson build does: copy the sources, apply lib/yaru.js's transforms, run sassc.
// With `palette: null` it builds Yaru's own dark purple theme, which must equal the installed one;
// the tests use that to prove the pipeline.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
    YaruBuildError, gtk3Entry, gtk3Variables, markDefaults, patchSassUtils, preprocessShellScss, replaceShellAccent,
    shellEntry, shellVariables,
} from '../lib/yaru.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

export const SASSC_TIMEOUT_S = 60;

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
    const argv = [program, '-a', ...includes.flatMap(i => ['-I', i]), entry, out];
    let proc;
    try {
        proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_PIPE);
    } catch (e) {
        throw new YaruBuildError(`cannot run ${program}: ${e.message} (install it with: sudo apt install sassc)`);
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
    return read(out);
}

/**
 * @param {object | null} palette a resolved palette, or null for Yaru's own dark purple theme
 * @param {{vendorDir: string, workDir: string, program?: string}} ctx
 * @returns {Promise<{css: string}>}
 */
export async function buildGtk3(palette, { vendorDir, workDir, program }) {
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
        entry = gtk3Entry(template, palette, entryPoint);
    } else {
        entry = template.replace('@yaru_dark_variant@', 'true').replace('@yaru_accent_color@', 'purple')
            .replace('@yaru_theme_entry_point@', entryPoint);
    }
    write(`${workDir}/gtk3-entry.scss`, entry);
    const common = prepareCommon(vendorDir, workDir);
    const css = await sassc(`${workDir}/gtk3-entry.scss`, `${workDir}/gtk3.css`, [common, copy], { program });
    return { css };
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
