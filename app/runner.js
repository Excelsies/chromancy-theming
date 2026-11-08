// Applies a palette to the enabled targets and restores them: loads palettes, checks each target's
// app and lock, runs the Yaru builds, plans every target and hands the operations to the applier. A
// target whose app is missing, or that is locked, fails to build or fails to plan, is reported and left
// exactly as it was (its earlier changes are not pruned), while the others go ahead. A target with
// nothing to apply for this palette (no terminal colors) is restored to how it was before Chromancy.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { apply, restore } from '../lib/applier.js';
import { resolvePalette } from '../lib/derive.js';
import { parseConfig, serializeConfig } from '../lib/config.js';
import { parsePalette, PaletteError } from '../lib/palette.js';
import { TARGETS } from '../lib/targets/index.js';
import { TargetSkipped } from '../lib/targets/common.js';
import { APP_TARGETS } from '../lib/blacklist.js';
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
        configPath: `${overrides.config ?? GLib.get_user_config_dir()}/chromancy-theming/config.json`,
        userTemplates: `${overrides.config ?? GLib.get_user_config_dir()}/chromancy-theming/templates`,
        templatesDir: `${appDir}/data/templates`,
        home: overrides.home ?? GLib.get_home_dir(),
        systemDataDirs: overrides.systemDataDirs ?? GLib.get_system_data_dirs(),
        wrapper: `${appDir}/bin/chromancy-theming-unthemed`,
        blacklist: [],
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
            const targetCtx = { ...ctx, system };
            const blacklistedApp = Object.entries(APP_TARGETS).find(([app, t]) => t === target.id && (ctx.blacklist ?? []).includes(app));
            if (blacklistedApp) {
                // A blacklisted app keeps its own colors: what this target applied before is restored.
                fail('skipped', `${blacklistedApp[0]} is blacklisted`);
                planned.push(target.id);
                continue;
            }
            let info = {};
            if (target.inspect) {
                try {
                    info = await target.inspect(targetCtx);
                } catch (e) {
                    fail('failed', `could not check for it: ${e.message}`);
                    continue;
                }
                if (!info.available) {
                    fail('skipped', info.reason);
                    continue;
                }
            }
            if (target.lock !== 'none') {
                let locked;
                try {
                    locked = await target.lock(targetCtx, info);
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
                    built = await BUILDERS[target.build](palette, { vendorDir: ctx.vendorDir, workDir: dir, gtkTheme: planCtx.gtkTheme });
                    if (built.assetsWarning)
                        results.push({ target: target.id, subject: 'images', status: 'skipped', error: built.assetsWarning });
                }
                const planned_ = target.plan(palette, { ...planCtx, info }, built);
                ops.push(...planned_);
                for (const note of planned_.notes ?? [])
                    results.push({ target: target.id, subject: 'note', status: 'skipped', error: note });
                planned.push(target.id);
            } catch (e) {
                if (e instanceof TargetSkipped) {
                    // Nothing to apply for this palette: what the target applied before is restored.
                    fail('skipped', e.message);
                    planned.push(target.id);
                } else {
                    fail('failed', e.message);
                }
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

/** The app's settings; an unreadable file gives the defaults and a warning. */
export async function loadConfig(ctx) {
    let text;
    try {
        text = await system.readText(ctx.configPath);
    } catch (e) {
        return { ...parseConfig(null, TARGETS.map(t => t.id)), warnings: [`config: cannot read ${ctx.configPath}: ${e.message}`] };
    }
    return parseConfig(text, TARGETS.map(t => t.id));
}

export function saveConfig(ctx, config) {
    return system.writeText(ctx.configPath, serializeConfig(config));
}

/** Writes a user palette (~/.config/chromancy-theming/palettes/<id>.json). */
export function savePalette(ctx, id, data) {
    return system.writeText(`${ctx.userPalettes}/${id}.json`, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Applies the blacklist (and the targets of blacklisted apps that have their own, when enabled) with the
 * applied palette, after the blacklist changed. Resolves to the results.
 */
export async function applyBlacklist(config, ctx) {
    const { palettes } = loadPalettes(ctx);
    const palette = palettes.get(config.applied) ?? palettes.get(config.palette) ?? palettes.values().next().value;
    const enabled = config.targets ?? TARGETS.map(t => t.id);
    const appTargets = Object.values(APP_TARGETS).filter(t => enabled.includes(t) && config.applied);
    return applyPalette(palette, ['blacklist', ...appTargets], { ...ctx, blacklist: config.blacklist });
}

/** Deletes one of the user's palettes (~/.config/chromancy-theming/palettes/<id>.json). */
export function deletePalette(ctx, id) {
    return system.remove(`${ctx.userPalettes}/${id}.json`);
}
