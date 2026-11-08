// The command line's parsing, output and exit statuses, on a temporary home.
import GLib from 'gi://GLib';
import { run } from '../../app/cli.js';
import { defaultContext } from '../../app/runner.js';

if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('refusing to run: set GSETTINGS_BACKEND=memory');
    imports.system.exit(2);
}
const tmp = GLib.dir_make_tmp('chromancy-cli-XXXXXX');
const ctx = { ...defaultContext({ config: `${tmp}/config`, data: `${tmp}/data`, state: `${tmp}/state` }), gtkTheme: 'Yaru-dark' };
let failures = 0;
const lines = [];
const check = (ok, what) => {
    lines.push(`${ok ? 'ok' : 'FAIL'}: ${what}`);
    if (!ok)
        failures++;
};
async function cli(...args) {
    const out = [], err = [];
    const status = await run(args, { ctx, out: l => out.push(l), err: l => err.push(l) });
    return { status, out, err };
}

let r = await cli('list');
check(r.status === 0 && r.out.length === 22 && r.out.some(l => l.startsWith('jeweltone-dark')), `list shows the 22 palettes (${r.status}, ${r.out.length})`);
r = await cli('apply', 'nope');
check(r.status === 2 && /no palette "nope"/.test(r.err[0]), 'an unknown palette is a usage error');
r = await cli('apply', 'nord', '--targets=gtk4,bogus');
check(r.status === 2 && /bogus/.test(r.err[0]), 'an unknown target is a usage error');
r = await cli('apply', 'nord', '--targets=gtk4,style');
check(r.status === 0 && r.out.length === 3 && r.out.every(l => / applied /.test(l)), `apply to two targets (${r.out.join(' | ')})`);
r = await cli('apply', 'nord', '--targets=gtk4,style');
check(r.status === 0 && r.out.every(l => / unchanged /.test(l)), 'applying again changes nothing');
r = await cli('restore', 'style');
check(r.status === 0 && r.out.length === 1 && /^style +restored/.test(r.out[0]), 'restore one target');
r = await cli('restore');
check(r.status === 0 && r.out.length === 2, 'restore the rest');
r = await cli('frobnicate');
check(r.status === 2 && /usage:/.test(r.err[0]), 'an unknown command prints the usage');

GLib.spawn_sync(null, ['rm', '-rf', tmp], null, GLib.SpawnFlags.SEARCH_PATH, null);
for (const l of lines)
    print(l);
if (failures)
    imports.system.exit(1);
