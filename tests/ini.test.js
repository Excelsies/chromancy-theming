import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getIni, setIni, isEmptyIni } from '../lib/ini.js';

const qt = '[Appearance]\ncustom_palette=false\nstyle=Fusion\n\n[Fonts]\nfixed="Mono,10"\n';

test('getIni reads a key in a group, and top-level keys with group null', () => {
    assert.equal(getIni(qt, 'Appearance', 'style'), 'Fusion');
    assert.equal(getIni(qt, 'Fonts', 'fixed'), '"Mono,10"');
    assert.equal(getIni(qt, 'Appearance', 'missing'), null);
    assert.equal(getIni(qt, 'Missing', 'style'), null);
    assert.equal(getIni('color_theme = "Default"\n#c\nshown_boxes = "cpu"\n', null, 'color_theme'), '"Default"');
    assert.equal(getIni(null, 'A', 'b'), null);
});

test('setIni replaces a value in place, keeping every other line and the spacing', () => {
    assert.equal(setIni(qt, 'Appearance', 'style', 'kvantum'), qt.replace('style=Fusion', 'style=kvantum'));
    const btop = '#! config\n\n#* Theme\ncolor_theme = "Default"\n\ntheme_background = true\n';
    assert.equal(setIni(btop, null, 'color_theme', '"chromancy"'), btop.replace('"Default"', '"chromancy"'));
});

test('setIni adds a key to an existing group, after its last entry', () => {
    assert.equal(setIni(qt, 'Appearance', 'color_scheme_path', '/x.conf'),
        '[Appearance]\ncustom_palette=false\nstyle=Fusion\ncolor_scheme_path=/x.conf\n\n[Fonts]\nfixed="Mono,10"\n');
});

test('setIni adds a missing group at the end, and creates a file from nothing', () => {
    assert.equal(setIni(qt, 'Interface', 'x', '1'), `${qt}\n[Interface]\nx=1\n`);
    assert.equal(setIni(null, 'Context', 'filesystems', 'a;'), '[Context]\nfilesystems=a;\n');
    assert.equal(setIni('', null, 'k', 'v'), 'k=v\n');
});

test('setIni with null removes the key, and a group left with no entries', () => {
    assert.equal(setIni(qt, 'Fonts', 'fixed', null), '[Appearance]\ncustom_palette=false\nstyle=Fusion\n');
    assert.equal(setIni(qt, 'Appearance', 'style', null), '[Appearance]\ncustom_palette=false\n\n[Fonts]\nfixed="Mono,10"\n');
    assert.equal(setIni(qt, 'Appearance', 'missing', null), qt, 'removing what is not there changes nothing');
});

test('comments in a group keep it from being removed', () => {
    const t = '[A]\n# mine\nk=v\n';
    assert.equal(setIni(t, 'A', 'k', null), '[A]\n# mine\n');
});

test('isEmptyIni is true for nothing but blank lines', () => {
    assert.ok(isEmptyIni(''));
    assert.ok(isEmptyIni('\n\n'));
    assert.ok(!isEmptyIni('[A]\n'));
});
