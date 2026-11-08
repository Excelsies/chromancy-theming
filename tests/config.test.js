import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, serializeConfig, withFonts, DEFAULT_CONFIG } from '../lib/config.js';

const known = ['style', 'gtk4', 'gtk3', 'shell', 'fonts'];

test('no config file gives the defaults', () => {
    assert.deepEqual(parseConfig(null, known), { config: DEFAULT_CONFIG, warnings: [] });
    assert.deepEqual(DEFAULT_CONFIG, { palette: null, applied: null, targets: null, fonts: {}, blacklist: [] });
});

test('a config round-trips', () => {
    const c = { palette: 'nord', applied: 'nord', targets: ['gtk4', 'style'], fonts: { interface: 'Inter 11' }, blacklist: ['org.gnome.Nautilus.desktop'] };
    assert.deepEqual(parseConfig(serializeConfig(c), known), { config: c, warnings: [] });
});

test('a broken or partly wrong config falls back field by field and says why', () => {
    let r = parseConfig('{not json', known);
    assert.deepEqual(r.config, DEFAULT_CONFIG);
    assert.match(r.warnings[0], /not valid JSON/);
    r = parseConfig(JSON.stringify({ palette: 3, targets: ['gtk4', 'bogus'], fonts: { interface: 'Inter', monospace: 'Mono 10' } }), known);
    assert.equal(r.config.palette, null);
    assert.deepEqual(r.config.targets, ['gtk4']);
    assert.deepEqual(r.config.fonts, { monospace: 'Mono 10' });
    assert.equal(r.warnings.length, 3, r.warnings.join('; '));
});

test('withFonts lets the chosen fonts override the palette\'s, one role at a time', () => {
    const palette = { id: 'p', fonts: { interface: 'A 10', document: 'B 11' } };
    assert.deepEqual(withFonts(palette, { interface: 'C 12' }).fonts, { interface: 'C 12', document: 'B 11' });
    assert.equal(withFonts(palette, {}), palette, 'unchanged when nothing is chosen');
    assert.deepEqual(withFonts({ id: 'q', fonts: null }, { monospace: 'M 9' }).fonts, { monospace: 'M 9' });
});

test('blacklist entries must be desktop file ids; duplicates collapse', () => {
    const r = parseConfig(JSON.stringify({ blacklist: ['a.desktop', 'a.desktop', '../x.desktop', 'b', 3] }), known);
    assert.deepEqual(r.config.blacklist, ['a.desktop']);
    assert.equal(r.warnings.length, 1);
});
