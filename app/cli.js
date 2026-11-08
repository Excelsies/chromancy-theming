// The command line: list palettes, apply one, restore. Returns an exit status: 0 when everything
// asked for happened, 1 when something failed or was locked, 2 for a usage error.

import { applyPalette, loadConfig, loadPalettes, restoreTargets, saveConfig } from './runner.js';
import { withFonts } from '../lib/config.js';
import { TARGETS } from '../lib/targets/index.js';

export const USAGE = `usage: chromancy-theming list
       chromancy-theming apply <palette> [--targets=<id>,...]   (default: the targets enabled in the app)
       chromancy-theming restore [<target>...]
targets: ${TARGETS.map(t => t.id).join(', ')}`;

function report(results, out) {
    for (const r of results) {
        const extra = r.error ? `  ${r.error}` : r.overwrote ? '  (overwrote a later change)' : '';
        out(`${r.target.padEnd(6)} ${r.status.padEnd(9)} ${r.subject}${extra}`);
    }
    return results.some(r => r.status === 'failed' || r.status === 'locked') ? 1 : 0;
}

/**
 * @param {string[]} args the arguments after the program name
 * @param {{ctx: object, out: (line: string) => void, err: (line: string) => void}} io
 * @returns {Promise<number>} exit status
 */
export async function run(args, { ctx, out, err }) {
    const [command, ...rest] = args;
    const known = TARGETS.map(t => t.id);
    try {
        if (command === 'list' && rest.length === 0) {
            const { palettes, errors } = loadPalettes(ctx);
            for (const p of palettes.values())
                out(`${p.id.padEnd(18)} ${p.name} (${p.variant}, ${p.origin})`);
            for (const e of errors)
                err(`not loaded: ${e.file}: ${e.error}`);
            return errors.length ? 1 : 0;
        }
        if (command === 'apply' && rest.length >= 1) {
            const [id, ...opts] = rest;
            const { config, warnings } = await loadConfig(ctx);
            warnings.forEach(w => err(w));
            let targets = config.targets ?? known;
            for (const o of opts) {
                const m = /^--targets=(.+)$/.exec(o);
                if (!m)
                    return usage(err);
                targets = m[1].split(',');
            }
            const unknown = targets.filter(t => !known.includes(t));
            if (unknown.length) {
                err(`unknown target(s): ${unknown.join(', ')}`);
                return 2;
            }
            const { palettes } = loadPalettes(ctx);
            const palette = palettes.get(id);
            if (!palette) {
                err(`no palette "${id}"; see: chromancy-theming list`);
                return 2;
            }
            const status = report((await applyPalette(withFonts(palette, config.fonts), targets, ctx)).results, out);
            await saveConfig(ctx, { ...config, applied: id });
            return status;
        }
        if (command === 'restore') {
            const unknown = rest.filter(t => !known.includes(t));
            if (unknown.length) {
                err(`unknown target(s): ${unknown.join(', ')}`);
                return 2;
            }
            const status = report((await restoreTargets(rest.length ? rest : undefined, ctx)).results, out);
            if (rest.length === 0) {
                const { config } = await loadConfig(ctx);
                await saveConfig(ctx, { ...config, applied: null });
            }
            return status;
        }
    } catch (e) {
        err(e.message);
        return 1;
    }
    return usage(err);
}

function usage(err) {
    err(USAGE);
    return 2;
}
