import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, templateVars, TemplateError } from '../lib/template.js';
import { pangoFamily, qtFont } from '../lib/fontnames.js';
import { parsePalette } from '../lib/palette.js';
import { resolvePalette } from '../lib/derive.js';

const load = id => resolvePalette(parsePalette(id, JSON.parse(readFileSync(new URL(`../data/palettes/${id}.json`, import.meta.url), 'utf8'))));

test('render fills placeholders and refuses unknown ones, naming them', () => {
    assert.equal(render('a {{x}} b {{ y }}', { x: '1', y: '2' }), 'a 1 b 2');
    assert.throws(() => render('{{x}} {{nope}} {{nah}}', { x: '1' }), err => err instanceof TemplateError && /nope, nah/.test(err.message));
});

test('templateVars gives every color with and without #, the terminal colors and the name', () => {
    const v = templateVars(load('jeweltone-dark'));
    assert.equal(v.primary, '#e3c078');
    assert.equal(v['primary.hex'], 'e3c078');
    assert.equal(v['on-surface'], '#ede4d9');
    assert.equal(v.ansi11, '#e3c078');
    assert.equal(v['ansi9.hex'], 'e8736b');
    assert.equal(v['term-background'], '#0b0910');
    assert.equal(v['term-cursor-text'], '#17120a');
    assert.equal(v.name, 'Jeweltone Dark');
    assert.equal(v.variant, 'dark');
    assert.equal(v.secondary, '#b392d4');
});

test('optional roles fall back so templates can always use them', () => {
    const v = templateVars(load('nord'));
    assert.equal(v.secondary, v.primary);
    assert.equal(v.tertiary, v.secondary);
    assert.equal(v['inactive-border'], v['outline-variant']);
    assert.ok(/^#[0-9a-f]{6}$/.test(v.error));
});

test('a palette without terminal colors has no terminal variables', () => {
    const v = templateVars(load('noctalia'));
    assert.equal(v.ansi0, undefined);
    assert.throws(() => render('{{ansi0}}', v), TemplateError);
});

test('pangoFamily strips the size and style words', () => {
    assert.equal(pangoFamily('Ubuntu Sans 11'), 'Ubuntu Sans');
    assert.equal(pangoFamily('JetBrains Mono Bold Italic 10.5'), 'JetBrains Mono');
    assert.equal(pangoFamily('Cantarell'), 'Cantarell');
});

test('qtFont writes Qt 6\'s font string with weight and italic', () => {
    assert.equal(qtFont('Ubuntu Sans 11'), 'Ubuntu Sans,11,-1,5,400,0,0,0,0,0,0,0,0,0,0,1');
    assert.equal(qtFont('Inter Bold Italic 10.5'), 'Inter,10.5,-1,5,700,1,0,0,0,0,0,0,0,0,0,1');
});
