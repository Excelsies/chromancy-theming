// The shared applier scenarios against the real backend (app/system.js): real files in a temporary
// directory and real GSettings on the in-memory backend with a test schema. Plus the behavior only
// a real filesystem has: atomic replace, symlinks, file modes.
//
// Refuses to run unless GSETTINGS_BACKEND=memory, so it can never write the user's settings.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { scenarios } from '../shared/applierScenarios.js';
import { system } from '../../app/system.js';

if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('refusing to run: set GSETTINGS_BACKEND=memory');
    imports.system.exit(2);
}

// A hung async call must fail the run, not stall it.
const TIMEOUT_S = 60;
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TIMEOUT_S, () => {
    printerr(`FAIL: still running after ${TIMEOUT_S} s (a call that never completes?)`);
    imports.system.exit(1);
});

const SCHEMA = 'io.github.excelsies.ChromancyTheming.Test';
const root = GLib.dir_make_tmp('chromancy-test-XXXXXX');
const schemaDir = `${root}/schemas`;
GLib.mkdir_with_parents(schemaDir, 0o700);
GLib.file_set_contents(`${schemaDir}/${SCHEMA}.gschema.xml`, `<schemalist>
  <schema id="${SCHEMA}" path="/io/github/excelsies/ChromancyTheming/Test/">
    <key name="text" type="s"><default>''</default></key>
    <key name="list" type="as"><default>[]</default></key>
    <key name="flag" type="b"><default>false</default></key>
  </schema>
</schemalist>`);
const run = argv => {
    const [, , err, status] = GLib.spawn_sync(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
    if (status !== 0)
        throw new Error(`${argv.join(' ')}: ${new TextDecoder().decode(err)}`);
};
run(['glib-compile-schemas', schemaDir]);

let failures = 0;
const fail = msg => {
    failures++;
    printerr(`  FAIL: ${msg}`);
};
const show = v => JSON.stringify(v);
const t = {
    equal: (a, b, msg = '') => a !== b && fail(`${msg} expected ${show(b)}, got ${show(a)}`),
    deepEqual: (a, b, msg = '') => show(a) !== show(b) && fail(`${msg} expected ${show(b)}, got ${show(a)}`),
    ok: (v, msg = '') => !v && fail(`${msg} expected truthy, got ${show(v)}`),
    async rejects(promise, re, msg = '') {
        try {
            await promise;
            fail(`${msg} expected a rejection`);
        } catch (e) {
            if (!re.test(e.message))
                fail(`${msg} rejected with ${show(e.message)}, expected ${re}`);
        }
    },
};

const settingsFor = () => new Gio.Settings({
    settings_schema: Gio.SettingsSchemaSource.new_from_directory(schemaDir, Gio.SettingsSchemaSource.get_default(), false)
        .lookup(SCHEMA, false),
});

function makeEnv(n) {
    const base = `${root}/s${n}`;
    // Each file gets its own directory, so breakWrite can make one path unwritable without the others.
    const path = name => `${base}/files/${name}.d/${name}`;
    const ledgerPath = `${base}/state/ledger.json`;
    for (const p of [ledgerPath])
        GLib.mkdir_with_parents(GLib.path_get_dirname(p), 0o700);
    const settings = settingsFor();
    for (const key of ['text', 'list', 'flag'])
        settings.reset(key);
    const ensureDir = p => GLib.mkdir_with_parents(GLib.path_get_dirname(p), 0o700);
    return {
        system, ledgerPath, path,
        setting: key => ({ schema: SCHEMA, key, schemaDir }),
        async seedFile(p, text) {
            ensureDir(p);
            GLib.file_set_contents(p, text);
        },
        async seedSetting(ref, value) {
            const type = { text: 's', list: 'as', flag: 'b' }[ref.key];
            settings.set_value(ref.key, new GLib.Variant(type, value));
        },
        breakRead: p => GLib.chmod(p, 0o000),
        breakWrite: p => {
            ensureDir(p);
            GLib.chmod(GLib.path_get_dirname(p), 0o555);
        },
    };
}

const results = [];
let n = 0;
for (const s of scenarios) {
    const before = failures;
    try {
        await s.run(makeEnv(n++), t);
    } catch (e) {
        fail(`threw ${e}`);
    }
    results.push(`${failures === before ? 'ok' : 'FAIL'}: ${s.name}`);
}

// Real-filesystem behavior.
async function realOnly(name, fn) {
    const before = failures;
    const dir = `${root}/real${n++}`;
    GLib.mkdir_with_parents(dir, 0o700);
    try {
        await fn(dir);
    } catch (e) {
        fail(`threw ${e}`);
    }
    results.push(`${failures === before ? 'ok' : 'FAIL'}: ${name}`);
}

await realOnly('writeText replaces the file with a new one (new inode), so no reader sees it half-written', async dir => {
    // GIO writes in place when a file has several hard links (to keep them), so this checks a plain file.
    const inode = () => Gio.File.new_for_path(`${dir}/gtk.css`).query_info('unix::inode', 0, null)
        .get_attribute_uint64('unix::inode');
    GLib.file_set_contents(`${dir}/gtk.css`, 'old');
    const before = inode();
    await system.writeText(`${dir}/gtk.css`, 'new');
    t.equal(await system.readText(`${dir}/gtk.css`), 'new');
    t.ok(inode() !== before, 'same inode: written in place');
});

await realOnly('writeText through a symlink writes the target and keeps the link', async dir => {
    GLib.mkdir_with_parents(`${dir}/dotfiles`, 0o700);
    GLib.file_set_contents(`${dir}/dotfiles/gtk.css`, 'mine');
    run(['ln', '-s', 'dotfiles/gtk.css', `${dir}/gtk.css`]);
    const targetInode = () => Gio.File.new_for_path(`${dir}/dotfiles/gtk.css`).query_info('unix::inode', 0, null)
        .get_attribute_uint64('unix::inode');
    const before = targetInode();
    await system.writeText(`${dir}/gtk.css`, 'mine + import');
    t.ok(targetInode() !== before, 'target written in place, not replaced');
    const info = Gio.File.new_for_path(`${dir}/gtk.css`).query_info('standard::is-symlink',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    t.ok(info.get_is_symlink(), 'still a symlink');
    t.equal(await system.readText(`${dir}/dotfiles/gtk.css`), 'mine + import');
});

await realOnly('writeText keeps the file mode', async dir => {
    GLib.file_set_contents(`${dir}/private.conf`, 'a');
    GLib.chmod(`${dir}/private.conf`, 0o600);
    await system.writeText(`${dir}/private.conf`, 'b');
    const mode = Gio.File.new_for_path(`${dir}/private.conf`).query_info('unix::mode', 0, null)
        .get_attribute_uint32('unix::mode') & 0o777;
    t.equal(mode.toString(8), '600');
});

await realOnly('writeText writes an empty file, atomically, keeping the mode', async dir => {
    GLib.file_set_contents(`${dir}/empty.css`, 'old');
    GLib.chmod(`${dir}/empty.css`, 0o600);
    const info = () => Gio.File.new_for_path(`${dir}/empty.css`).query_info('unix::inode,unix::mode', 0, null);
    const before = info().get_attribute_uint64('unix::inode');
    await system.writeText(`${dir}/empty.css`, '');
    t.equal(await system.readText(`${dir}/empty.css`), '');
    t.ok(info().get_attribute_uint64('unix::inode') !== before, 'written in place');
    t.equal((info().get_attribute_uint32('unix::mode') & 0o777).toString(8), '600');
    await system.writeText(`${dir}/new-empty.css`, '');
    t.equal(await system.readText(`${dir}/new-empty.css`), '', 'a new empty file');
});

await realOnly('writeText creates missing parent directories', async dir => {
    await system.writeText(`${dir}/a/b/c.css`, 'x');
    t.equal(await system.readText(`${dir}/a/b/c.css`), 'x');
});

await realOnly('a setting from a missing schema is an error naming the schema', async () => {
    await t.rejects(system.readSetting({ schema: 'no.such.Schema', key: 'k', schemaDir }), /no\.such\.Schema/);
});

run(['chmod', '-R', 'u+rwx', root]);
run(['rm', '-rf', root]);

for (const line of results)
    print(line);
if (failures) {
    printerr(`${failures} failure(s)`);
    imports.system.exit(1);
}
print(`ok: ${results.length} applier checks on the real backend`);
