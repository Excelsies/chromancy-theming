// Applies a palette to the enabled targets and restores them: loads palettes, checks each target's
// lock, runs the Yaru builds, plans every target and hands the operations to the applier. A target
// that is locked, fails to build or fails to plan is reported and left exactly as it was (its earlier
// changes are not pruned), while the others go ahead.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { apply, restore } from '../lib/applier.js';
import { resolvePalette } from '../lib/derive.js';
import { parsePalette, PaletteError } from '../lib/palette.js';
import { TARGETS } from '../lib/targets/index.js';
import { buildGtk3, buildShell } from './yaruBuild.js';
import { system } from './system.js';

const decoder = new TextDecoder();
const BUILDERS = { gtk3: buildGtk3, shell: buildShell };

/**
 * The directories and settings a run works with. Tests pass their own; the app uses the user's.
 * @param {{config?: string, data?: string, state?: string, appDir?: string}} [overrides]
 */
export function defaultContext(overrides = {}) {
    const appDir = overrides.appDir ?? GLib.canonicalize_filename(
        `${GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0])}/..`, null);
    const state = overrides.state ?? GLib.get_user_state_dir();
    return {
        paths: {
            config: overrides.config ?? GLib.get_user_config_dir(),
            data: overrides.data ?? GLib.get_user_data_dir(),
        },
        ledgerPath: `${state}/chromancy-theming/ledger.json`,
        builtinPalettes: `${appDir}/data/palettes`,
        userPalettes: `${overrides.config ?? GLib.get_user_config_dir()}/chromancy-theming/palettes`,
        vendorDir: `${appDir}/vendor/yaru`,
    };
}

function listJson(dir) {
    const out = [];
    let enumerator;
    try {
        enumerator = Gio.File.new_for_path(dir).enumerate_children('standard::name', 0, null);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return out;
        throw e;
    }
    for (let info; (info = enumerator.next_file(null));) {
        if (info.get_name().endsWith('.json'))
            out.push(info.get_name());
    }
    return out.sort();
}

/**
 * Built-in palettes, then the user's (~/.config/chromancy-theming/palettes); a user palette with a
 * built-in's id replaces it. A palette that does not parse is listed with its error, not dropped.
 * @returns {{palettes: Map<string, object>, errors: {file: string, error: string}[]}}
 */
export function loadPalettes(ctx) {
    const palettes = new Map();
    const errors = [];
    for (const [dir, origin] of [[ctx.builtinPalettes, 'built-in'], [ctx.userPalettes, 'user']]) {
        for (const name of listJson(dir)) {
            const file = `${dir}/${name}`;
            try {
                const parsed = parsePalette(name.slice(0, -5), JSON.parse(decoder.decode(GLib.file_get_contents(file)[1])));
                palettes.set(parsed.id, { ...resolvePalette(parsed), origin, file });
            } catch (e) {
                errors.push({ file, error: e instanceof PaletteError || e instanceof SyntaxError ? e.message : String(e) });
            }
        }
    }
    return { palettes, errors };
}

function readGtkTheme() {
    try {
        return new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).get_string('gtk-theme');
    } catch {
        return '';
    }
}

/**
 * @param {object} palette a resolved palette
 * @param {string[]} targetIds the enabled targets
 * @param {ReturnType<typeof defaultContext>} ctx
 * @returns {Promise<{results: object[]}>} one result per operation, plus one per target that was
 *   locked or failed before planning (subject "target")
 */
export async function applyPalette(palette, targetIds, ctx) {
    const results = [];
    const ops = [];
    const planned = [];
    const work = GLib.dir_make_tmp('chromancy-build-XXXXXX');
    const planCtx = { paths: ctx.paths, gtkTheme: ctx.gtkTheme ?? readGtkTheme() };
    try {
        for (const target of TARGETS.filter(t => targetIds.includes(t.id))) {
            const fail = (status, error) => results.push({ target: target.id, subject: 'target', status, error });
            if (target.lock !== 'none') {
                let locked;
                try {
                    locked = await target.lock(ctx);
                } catch (e) {
                    fail('locked', `its lock could not be read: ${e.message}`);
                    continue;
                }
                if (locked) {
                    fail('locked', 'the app asks other programs not to change its theme');
                    continue;
                }
            }
            let built;
            try {
                if (target.build) {
                    const dir = `${work}/${target.id}`;
                    GLib.mkdir_with_parents(dir, 0o700);
                    built = await BUILDERS[target.build](palette, { vendorDir: ctx.vendorDir, workDir: dir });
                }
                ops.push(...target.plan(palette, planCtx, built));
                planned.push(target.id);
            } catch (e) {
                fail('failed', e.message);
            }
        }
        const applied = await apply(ops, { system, ledgerPath: ctx.ledgerPath, targets: planned });
        return { results: [...results, ...applied.results] };
    } finally {
        GLib.spawn_sync(null, ['rm', '-rf', work], null, GLib.SpawnFlags.SEARCH_PATH, null);
    }
}

/** Restores the given targets, or every target when none are given. */
export function restoreTargets(targetIds, ctx) {
    return restore({ system, ledgerPath: ctx.ledgerPath, targets: targetIds });
}
