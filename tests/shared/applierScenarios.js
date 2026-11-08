// Applier behavior, written once and run against two backends: the in-memory fake under node
// (tests/applier.test.js) and the real Gio files and GSettings under GJS (tests/gjs/applier.gjs.js).
// Each scenario gets `env`:
//   env.system                 the backend under test
//   env.path(name)             an absolute path inside the scenario's sandbox
//   env.ledgerPath             where the ledger lives
//   env.setting(key)           a setting ref {schema, key, schemaDir?} on the test schema; keys:
//                              'text' (s, default ''), 'list' (as, default []), 'flag' (b, default false)
//   env.seedFile(path, text)   create a file before the scenario acts
//   env.seedSetting(ref, v)    set a user value before the scenario acts
//   env.breakRead(path)        make reading that path fail
//   env.breakWrite(path)       make writing that path fail
// and `t` with equal(a, b, msg), deepEqual(a, b, msg), ok(v, msg), rejects(promise, pattern, msg).

import { apply, restore } from '../../lib/applier.js';

const fileOp = (env, name, content, target = 'gtk4') => ({ target, kind: 'file', path: env.path(name), content });
const settingOp = (env, key, value, target = 'fonts') => ({ target, kind: 'setting', ...env.setting(key), value });
const status = r => r.results.map(x => x.status);

export const scenarios = [
    {
        name: 'apply writes a new file and restore removes it again',
        async run(env, t) {
            const { system, ledgerPath } = env;
            const r = await apply([fileOp(env, 'a.css', 'x {}')], { system, ledgerPath });
            t.deepEqual(status(r), ['applied']);
            t.equal(await system.readText(env.path('a.css')), 'x {}');
            const back = await restore({ system, ledgerPath });
            t.deepEqual(status(back), ['restored']);
            t.equal(await system.readText(env.path('a.css')), null, 'file absent again');
        },
    },
    {
        name: 'restore puts back the exact original content of an existing file',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(env.path('gtk.css'), 'user content\n');
            await apply([fileOp(env, 'gtk.css', 'user content\n@import x;\n')], { system, ledgerPath });
            await apply([fileOp(env, 'gtk.css', 'user content\n@import y;\n')], { system, ledgerPath });
            await restore({ system, ledgerPath });
            t.equal(await system.readText(env.path('gtk.css')), 'user content\n', 'first baseline, not the second apply');
        },
    },
    {
        name: 'applying the same content twice reports unchanged and does not write',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await apply([fileOp(env, 'a.css', 'x {}')], { system, ledgerPath });
            env.breakWrite(env.path('a.css'));
            const r = await apply([fileOp(env, 'a.css', 'x {}')], { system, ledgerPath });
            t.deepEqual(status(r), ['unchanged'], 'a write would have failed');
        },
    },
    {
        name: 'a setting is restored to its user value, or reset when it had none',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedSetting(env.setting('text'), 'mine');
            await apply([settingOp(env, 'text', 'theirs'), settingOp(env, 'list', ['#e3c078'])], { system, ledgerPath });
            t.deepEqual(await system.readSetting(env.setting('text')), { value: 'theirs', userSet: true });
            t.deepEqual(await system.readSetting(env.setting('list')), { value: ['#e3c078'], userSet: true });
            await restore({ system, ledgerPath });
            t.deepEqual(await system.readSetting(env.setting('text')), { value: 'mine', userSet: true });
            t.deepEqual(await system.readSetting(env.setting('list')), { value: [], userSet: false }, 'reset, not set to the default');
        },
    },
    {
        name: 'restore overwrites a value someone changed since, and says so',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await apply([settingOp(env, 'flag', true)], { system, ledgerPath });
            await system.writeSetting(env.setting('flag'), false);
            await system.writeSetting(env.setting('text'), 'unrelated');
            const back = await restore({ system, ledgerPath });
            t.equal(back.results.length, 1);
            t.equal(back.results[0].status, 'restored');
            t.equal(back.results[0].overwrote, true);
            t.deepEqual(await system.readSetting(env.setting('flag')), { value: false, userSet: false });
        },
    },
    {
        name: 'restore of a value nobody changed does not say it overwrote',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await apply([settingOp(env, 'flag', true)], { system, ledgerPath });
            const back = await restore({ system, ledgerPath });
            t.equal(back.results[0].overwrote, false);
        },
    },
    {
        name: 'restore can be limited to some targets, and keeps the others',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await apply([fileOp(env, 'a.css', 'a', 'gtk4'), fileOp(env, 'b.css', 'b', 'gtk3')], { system, ledgerPath });
            const back = await restore({ system, ledgerPath, targets: ['gtk3'] });
            t.deepEqual(back.results.map(r => r.target), ['gtk3']);
            t.equal(await system.readText(env.path('b.css')), null);
            t.equal(await system.readText(env.path('a.css')), 'a');
            await restore({ system, ledgerPath });
            t.equal(await system.readText(env.path('a.css')), null, 'still restorable later');
        },
    },
    {
        name: 'a failed write fails that op only and the others still apply',
        async run(env, t) {
            const { system, ledgerPath } = env;
            env.breakWrite(env.path('bad.css'));
            const r = await apply([fileOp(env, 'bad.css', 'x'), fileOp(env, 'good.css', 'y')], { system, ledgerPath });
            t.deepEqual(status(r), ['failed', 'applied']);
            t.ok(r.results[0].error, 'the failure carries its error');
            t.equal(r.results[0].subject, `file:${env.path('bad.css')}`, 'and names its subject');
            t.equal(await system.readText(env.path('good.css')), 'y');
        },
    },
    {
        name: 'an unreadable current value fails that op without writing it',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(env.path('locked.css'), 'keep');
            env.breakRead(env.path('locked.css'));
            const r = await apply([fileOp(env, 'locked.css', 'new')], { system, ledgerPath });
            t.deepEqual(status(r), ['failed']);
        },
    },
    {
        name: 'a corrupt ledger refuses apply and restore and is left as it was',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(ledgerPath, '{not json');
            await t.rejects(apply([fileOp(env, 'a.css', 'x')], { system, ledgerPath }), /ledger/i, 'apply');
            await t.rejects(restore({ system, ledgerPath }), /ledger/i, 'restore');
            t.equal(await system.readText(env.path('a.css')), null, 'nothing written');
            t.equal(await system.readText(ledgerPath), '{not json', 'ledger untouched');
        },
    },
    {
        name: 'an unreadable ledger refuses apply',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(ledgerPath, '{"version":1,"entries":{}}');
            env.breakRead(ledgerPath);
            await t.rejects(apply([fileOp(env, 'a.css', 'x')], { system, ledgerPath }), /ledger/i);
            t.equal(await system.readText(env.path('a.css')), null, 'nothing written');
        },
    },
    {
        name: 'a ledger that cannot be saved stops apply before the first write',
        async run(env, t) {
            const { system, ledgerPath } = env;
            env.breakWrite(ledgerPath);
            await t.rejects(apply([fileOp(env, 'a.css', 'x')], { system, ledgerPath }), /ledger/i);
            t.equal(await system.readText(env.path('a.css')), null, 'no write without a saved baseline');
        },
    },
    {
        name: 'a file that was absent and is absent again restores as unchanged',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await apply([fileOp(env, 'a.css', 'x')], { system, ledgerPath });
            await system.remove(env.path('a.css'));
            const back = await restore({ system, ledgerPath });
            t.deepEqual(status(back), ['unchanged']);
        },
    },
    {
        name: 'a content of null removes the file, and restore brings it back',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(env.path('old.css'), 'old');
            const r = await apply([fileOp(env, 'old.css', null)], { system, ledgerPath });
            t.deepEqual(status(r), ['applied']);
            t.equal(await system.readText(env.path('old.css')), null);
            await restore({ system, ledgerPath });
            t.equal(await system.readText(env.path('old.css')), 'old');
        },
    },
];
