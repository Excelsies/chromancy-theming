// Applier behavior, written once and run against two backends: the in-memory fake under node
// (tests/applier.test.js) and the real Gio files and GSettings under GJS (tests/gjs/applier.gjs.js).
// Each scenario gets `env`:
//   env.system                 the backend under test
//   env.path(name)             an absolute path inside the scenario's sandbox
//   env.ledgerPath             where the ledger lives
//   env.setting(key)           a setting ref {schema, key, schemaDir?} on the test schema; keys:
//                              'text' (s, default ''), 'list' (as, default []), 'flag' (b, default false)
//   env.relocatable(path)      a setting ref for key 'name' (s, default '') of a relocatable schema at path
//   env.seedFile(path, text)   create a file before the scenario acts
//   env.seedSetting(ref, v)    set a user value before the scenario acts
//   env.breakRead(path)        make reading that path fail
//   env.breakWrite(path)       make writing that path fail
// and `t` with equal(a, b, msg), deepEqual(a, b, msg), ok(v, msg), rejects(promise, pattern, msg).

import { apply, restore, LINE_MARKER } from '../../lib/applier.js';

const fileOp = (env, name, content, target = 'gtk4') => ({ target, kind: 'file', path: env.path(name), content });
const settingOp = (env, key, value, target = 'fonts') => ({ target, kind: 'setting', ...env.setting(key), value });
const lineOp = (env, name, url, target = 'gtk4') =>
    ({ target, kind: 'line', path: env.path(name), line: `@import url("${url}"); ${LINE_MARKER}` });
const status = r => r.results.map(x => x.status);
const iniOp = (env, name, group, key, value, target = 'qt') => ({ target, kind: 'ini', path: env.path(name), group, key, value });
const listOp = (env, name, items, target = 'flatpak') =>
    ({ target, kind: 'ini-list', path: env.path(name), group: 'Context', key: 'filesystems', items });

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
    {
        name: 'a managed line goes at the top, keeps the user content, and restore removes only that line',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(env.path('gtk.css'), 'a { }\n');
            await apply([lineOp(env, 'gtk.css', 'file:///x.css')], { system, ledgerPath });
            t.equal(await system.readText(env.path('gtk.css')), `@import url("file:///x.css"); ${LINE_MARKER}\na { }\n`);
            await system.writeText(env.path('gtk.css'), `${await system.readText(env.path('gtk.css'))}b { }\n`);
            const back = await restore({ system, ledgerPath });
            t.deepEqual(status(back), ['restored']);
            t.equal(await system.readText(env.path('gtk.css')), 'a { }\nb { }\n', 'the later user edit survives');
        },
    },
    {
        name: 'a managed line is replaced, not duplicated, and the same line again is unchanged',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(env.path('gtk.css'), 'a { }\n');
            await apply([lineOp(env, 'gtk.css', 'file:///x.css')], { system, ledgerPath });
            await apply([lineOp(env, 'gtk.css', 'file:///y.css')], { system, ledgerPath });
            t.equal(await system.readText(env.path('gtk.css')), `@import url("file:///y.css"); ${LINE_MARKER}\na { }\n`);
            const again = await apply([lineOp(env, 'gtk.css', 'file:///y.css')], { system, ledgerPath });
            t.deepEqual(status(again), ['unchanged']);
        },
    },
    {
        name: 'a file created only for a managed line is removed again on restore',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await apply([lineOp(env, 'gtk.css', 'file:///x.css')], { system, ledgerPath });
            t.equal(await system.readText(env.path('gtk.css')), `@import url("file:///x.css"); ${LINE_MARKER}\n`);
            await restore({ system, ledgerPath });
            t.equal(await system.readText(env.path('gtk.css')), null);
        },
    },
    {
        name: 'a managed line without the marker is refused',
        async run(env, t) {
            const { system, ledgerPath } = env;
            const r = await apply([{ target: 'gtk4', kind: 'line', path: env.path('gtk.css'), line: '@import x;' }], { system, ledgerPath });
            t.deepEqual(status(r), ['failed']);
            t.equal(await system.readText(env.path('gtk.css')), null);
        },
    },
    {
        name: 'a subject a target stops writing is restored in the same apply; other targets are left alone',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedSetting(env.setting('text'), 'before');
            await apply([fileOp(env, 'a.css', 'a', 'gtk4'), settingOp(env, 'text', 'palette font', 'fonts'),
                fileOp(env, 'b.css', 'b', 'gtk3')], { system, ledgerPath, targets: ['gtk4', 'fonts', 'gtk3'] });
            const r = await apply([fileOp(env, 'a.css', 'a', 'gtk4')], { system, ledgerPath, targets: ['gtk4', 'fonts'] });
            t.deepEqual(r.results.map(x => `${x.target}:${x.status}`), ['gtk4:unchanged', 'fonts:restored']);
            t.deepEqual(await system.readSetting(env.setting('text')), { value: 'before', userSet: true });
            t.equal(await system.readText(env.path('b.css')), 'b', 'gtk3 was not in this apply');
        },
    },
    {
        name: 'an ini key is set in place and restore puts back only its old value',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(env.path('qt6ct.conf'), '[Appearance]\nstyle=Fusion\ncustom_palette=false\n');
            await apply([iniOp(env, 'qt6ct.conf', 'Appearance', 'custom_palette', 'true'),
                iniOp(env, 'qt6ct.conf', 'Appearance', 'color_scheme_path', '/c.conf')], { system, ledgerPath });
            t.equal(await system.readText(env.path('qt6ct.conf')), '[Appearance]\nstyle=Fusion\ncustom_palette=true\ncolor_scheme_path=/c.conf\n');
            // The user changes another key afterwards; restore keeps it.
            await system.writeText(env.path('qt6ct.conf'), (await system.readText(env.path('qt6ct.conf'))).replace('Fusion', 'kvantum'));
            const back = await restore({ system, ledgerPath });
            t.deepEqual(status(back), ['restored', 'restored']);
            t.equal(await system.readText(env.path('qt6ct.conf')), '[Appearance]\nstyle=kvantum\ncustom_palette=false\n');
        },
    },
    {
        name: 'an ini file created by apply is removed by restore',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await apply([iniOp(env, 'new.conf', 'Appearance', 'a', '1'), iniOp(env, 'new.conf', 'Fonts', 'b', '2')], { system, ledgerPath });
            t.equal(await system.readText(env.path('new.conf')), '[Appearance]\na=1\n\n[Fonts]\nb=2\n');
            await restore({ system, ledgerPath });
            t.equal(await system.readText(env.path('new.conf')), null);
        },
    },
    {
        name: 'an ini list gains only missing items, and restore removes only those',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(env.path('global'), '[Context]\nfilesystems=home;xdg-config/gtk-3.0:ro;\n');
            const r = await apply([listOp(env, 'global', ['xdg-config/gtk-4.0:ro', 'xdg-config/gtk-3.0:ro'])], { system, ledgerPath });
            t.deepEqual(status(r), ['applied']);
            t.equal(await system.readText(env.path('global')), '[Context]\nfilesystems=home;xdg-config/gtk-3.0:ro;xdg-config/gtk-4.0:ro;\n');
            const again = await apply([listOp(env, 'global', ['xdg-config/gtk-4.0:ro', 'xdg-config/gtk-3.0:ro'])], { system, ledgerPath });
            t.deepEqual(status(again), ['unchanged']);
            // The user grants something else afterwards; restore keeps it, and the gtk-3.0 grant that was theirs.
            await system.writeText(env.path('global'), '[Context]\nfilesystems=home;xdg-config/gtk-3.0:ro;xdg-config/gtk-4.0:ro;xdg-download;\n');
            await restore({ system, ledgerPath });
            t.equal(await system.readText(env.path('global')), '[Context]\nfilesystems=home;xdg-config/gtk-3.0:ro;xdg-download;\n');
        },
    },
    {
        name: 'an ini list in a file created by apply is removed by restore',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await apply([listOp(env, 'global', ['xdg-config/gtk-4.0:ro'])], { system, ledgerPath });
            t.equal(await system.readText(env.path('global')), '[Context]\nfilesystems=xdg-config/gtk-4.0:ro;\n');
            await restore({ system, ledgerPath });
            t.equal(await system.readText(env.path('global')), null);
        },
    },
    {
        name: 'restore undoes in the reverse order of apply',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await apply([settingOp(env, 'text', 'first', 'conjure'), settingOp(env, 'flag', true, 'conjure')], { system, ledgerPath });
            const back = await restore({ system, ledgerPath });
            t.deepEqual(back.results.map(r => r.subject.split('/').pop()), ['flag', 'text']);
        },
    },
    {
        name: 'a setting of a relocatable schema is set at its path and restored there',
        async run(env, t) {
            const { system, ledgerPath } = env;
            const a = env.relocatable('/io/github/excelsies/ChromancyTheming/Test/profiles/a/');
            const b = env.relocatable('/io/github/excelsies/ChromancyTheming/Test/profiles/b/');
            await env.seedSetting(a, 'Jeweltone');
            await apply([{ target: 'ptyxis', kind: 'setting', ...a, value: 'Chromancy' }], { system, ledgerPath });
            t.deepEqual(await system.readSetting(a), { value: 'Chromancy', userSet: true });
            t.deepEqual(await system.readSetting(b), { value: '', userSet: false }, 'another path is untouched');
            await restore({ system, ledgerPath });
            t.deepEqual(await system.readSetting(a), { value: 'Jeweltone', userSet: true });
        },
    },
    {
        name: 'a binary file (base64) is written and restored like a text one',
        async run(env, t) {
            const { system, ledgerPath } = env;
            const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';
            await env.seedFile(env.path('old.css'), 'x');
            const op = { target: 'gtk3', kind: 'file', encoding: 'base64', path: env.path('a.png'), content: png };
            t.deepEqual(status(await apply([op], { system, ledgerPath })), ['applied']);
            t.equal(await system.readBase64(env.path('a.png')), png);
            t.deepEqual(status(await apply([op], { system, ledgerPath })), ['unchanged']);
            await restore({ system, ledgerPath });
            t.equal(await system.readBase64(env.path('a.png')), null);
        },
    },
    {
        name: 'a symlink is pointed elsewhere and restore points it back',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(env.path('real.css'), 'user css');
            await env.seedLink(env.path('snap-gtk.css'), env.path('real.css'));
            const op = { target: 'blacklist', kind: 'symlink', path: env.path('snap-gtk.css'), linkTarget: env.path('unthemed.css') };
            t.deepEqual(status(await apply([op], { system, ledgerPath })), ['applied']);
            t.equal(await system.readLink(env.path('snap-gtk.css')), env.path('unthemed.css'));
            t.deepEqual(status(await apply([op], { system, ledgerPath })), ['unchanged']);
            await restore({ system, ledgerPath });
            t.equal(await system.readLink(env.path('snap-gtk.css')), env.path('real.css'));
            t.equal(await system.readText(env.path('real.css')), 'user css', 'the link target itself is untouched');
        },
    },
    {
        name: 'a symlink made where nothing was is removed again; a regular file is put back as a file',
        async run(env, t) {
            const { system, ledgerPath } = env;
            await env.seedFile(env.path('plain.css'), 'mine');
            await apply([{ target: 'blacklist', kind: 'symlink', path: env.path('new-link.css'), linkTarget: env.path('x.css') },
                { target: 'blacklist', kind: 'symlink', path: env.path('plain.css'), linkTarget: env.path('x.css') }], { system, ledgerPath });
            t.equal(await system.readLink(env.path('plain.css')), env.path('x.css'));
            await restore({ system, ledgerPath });
            t.equal(await system.readLink(env.path('new-link.css')), null);
            t.equal(await system.readText(env.path('new-link.css')), null);
            t.equal(await system.readLink(env.path('plain.css')), null, 'a file again, not a link');
            t.equal(await system.readText(env.path('plain.css')), 'mine');
            t.equal(await system.readText(env.path('x.css')), null, 'nothing was written through the link');
        },
    },
];
