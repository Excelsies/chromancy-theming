import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePtyxisPalette } from '../lib/ptyxisPalette.js';

const fixture = name => readFileSync(new URL(`fixtures/ptyxis/${name}`, import.meta.url), 'utf8');

test('a palette with Light and Dark sections gives both variants', () => {
    const p = parsePtyxisPalette(fixture('Jeweltone.palette'));
    assert.equal(p.name, 'Jeweltone');
    assert.equal(p.dark.background, '#0b0910');
    assert.equal(p.dark.foreground, '#ede4d9');
    assert.equal(p.dark.cursor, '#e3c078');
    assert.equal(p.dark['cursor-text'], '#17120a');
    assert.equal(p.dark.ansi.length, 16);
    assert.equal(p.dark.ansi[11], '#e3c078');
    assert.equal(p.light.background, '#f5efe6');
    assert.equal(p.light.ansi[0], '#1f1a24');
});

test('a palette without sections uses the same colors for both variants', () => {
    const p = parsePtyxisPalette(fixture('Moonfly.palette'));
    assert.equal(p.name, 'Moonfly');
    assert.deepEqual(p.light, p.dark);
    assert.equal(p.dark.background, '#080808');
    assert.equal(p.dark.ansi[15], '#e4e4e4');
});

test('a missing ANSI color is an error naming the section and key', () => {
    const text = fixture('Moonfly.palette').replace(/^Color7=.*\n/m, '');
    assert.throws(() => parsePtyxisPalette(text), /\[Palette\] Color7: missing/);
});

test('a bad color is an error naming its line', () => {
    const text = fixture('Moonfly.palette').replace('Color3=#E3C78A', 'Color3=yellow');
    assert.throws(() => parsePtyxisPalette(text), /line \d+: Color3/);
});

test('comments and blank lines are ignored', () => {
    const p = parsePtyxisPalette(`# a comment\n\n${fixture('Moonfly.palette')}\n\n# trailing\n`);
    assert.equal(p.name, 'Moonfly');
});
