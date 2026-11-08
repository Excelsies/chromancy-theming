import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parsePalette } from '../lib/palette.js';
import { resolvePalette } from '../lib/derive.js';

const DIR = new URL('../data/palettes/', import.meta.url);
const files = readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
const load = f => resolvePalette(parsePalette(f.slice(0, -5), JSON.parse(readFileSync(new URL(f, DIR), 'utf8'))));

test('the built-in set is Jeweltone Dark and Light plus Conjure Launcher\'s other themes', () => {
    assert.deepEqual(files.map(f => f.slice(0, -5)), [
        'aura', 'ayu', 'catppuccin', 'dracula', 'eldritch', 'gotham', 'gruvbox', 'jellybeans', 'jeweltone-dark',
        'jeweltone-light', 'kanagawa', 'molokai', 'moonfly', 'night-owl', 'noctalia', 'nord', 'oceanic-next',
        'one-half-black', 'oxocarbon-dark', 'rose-pine', 'tokyo-night', 'tomorrow-night',
    ]);
});

test('every built-in parses, meets the contrast floor and has a unique name', () => {
    const names = new Set();
    for (const f of files) {
        const p = load(f);
        assert.deepEqual(p.warnings, [], `${f}: ${p.warnings.join('; ')}`);
        assert.ok(!names.has(p.name), `${f}: duplicate name ${p.name}`);
        names.add(p.name);
    }
});

test('built-ins give every UI color role rather than relying on derivation', () => {
    for (const f of files)
        assert.deepEqual(load(f).derived, [], f);
});

test('every built-in except Eldritch and Noctalia has terminal colors', () => {
    const without = files.filter(f => load(f).terminal === null).map(f => f.slice(0, -5));
    assert.deepEqual(without, ['eldritch', 'noctalia']);
});

test('Jeweltone matches its Noctalia, Hyprland and terminal definitions', () => {
    const dark = load('jeweltone-dark.json');
    assert.deepEqual([dark.colors.primary, dark.colors.secondary, dark.colors.tertiary, dark.colors.error],
        ['#e3c078', '#b392d4', '#43e597', '#e8736b']);
    assert.equal(dark.terminal['cursor-text'], '#17120a');
    assert.equal(dark.terminal.ansi[9], '#e8736b');
    const light = load('jeweltone-light.json');
    assert.deepEqual([light.colors.surface, light.colors['surface-container'], light.colors.hover],
        ['#f5efe6', '#e6dccd', '#e0d5c6']);
    assert.equal(light.terminal.ansi[15], '#0f0c14');
});

test('the Jeweltone terminal colors match the Ptyxis palette file', async () => {
    const { parsePtyxisPalette } = await import('../lib/ptyxisPalette.js');
    const ptyxis = parsePtyxisPalette(readFileSync(new URL('fixtures/ptyxis/Jeweltone.palette', import.meta.url), 'utf8'));
    assert.deepEqual(load('jeweltone-dark.json').terminal, ptyxis.dark);
    assert.deepEqual(load('jeweltone-light.json').terminal, ptyxis.light);
});
