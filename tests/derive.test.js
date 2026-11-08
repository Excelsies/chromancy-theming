import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePalette, COLOR_ROLES } from '../lib/palette.js';
import { resolvePalette, CONTRAST_FLOOR } from '../lib/derive.js';
import { contrast } from '../lib/color.js';

const resolve = (colors, extra = {}) => resolvePalette(parsePalette('t', { name: 'T', colors, ...extra }));

test('every color role is filled, and the derived ones are listed', () => {
    const r = resolve({ primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff' });
    for (const role of COLOR_ROLES)
        assert.match(r.colors[role], /^#[0-9a-f]{6}$/, role);
    assert.deepEqual(r.derived.sort(),
        ['hover', 'on-hover', 'on-primary', 'on-surface-variant', 'outline-variant', 'surface-container']);
});

test('given colors are kept as they are', () => {
    const r = resolve({ primary: '#3584e4', 'on-primary': '#ff0000', surface: '#1e1e1e', 'on-surface': '#ffffff' });
    assert.equal(r.colors['on-primary'], '#ff0000');
    assert.ok(!r.derived.includes('on-primary'));
});

test('derived surfaces step from surface toward on-surface', () => {
    const r = resolve({ primary: '#3584e4', surface: '#000000', 'on-surface': '#ffffff' });
    assert.equal(r.colors['surface-container'], '#121212'); // 7%
    assert.equal(r.colors.hover, '#1f1f1f'); // 12%
    assert.equal(r.colors['outline-variant'], '#292929'); // 16%
    assert.equal(r.colors['on-surface-variant'], '#8c8c8c'); // 55%
});

test('derived secondary text is pushed toward on-surface until it reaches 3:1', () => {
    // Low-contrast seeds: a 55% mix would be under 3:1.
    const r = resolve({ primary: '#3584e4', surface: '#202020', 'on-surface': '#909090' });
    assert.ok(contrast(r.colors['on-surface-variant'], r.colors.surface) >= 3
        || r.colors['on-surface-variant'] === r.colors['on-surface']);
});

test('text on primary and hover uses the palette text rule', () => {
    const r = resolve({ primary: '#e3c078', surface: '#0b0910', 'on-surface': '#ede4d9' });
    assert.equal(r.colors['on-primary'], '#0b0910');
    assert.equal(r.colors['on-hover'], '#ede4d9');
});

test('variant follows the given value, else surface vs on-surface luminance', () => {
    assert.equal(resolve({ primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff' }).variant, 'dark');
    assert.equal(resolve({ primary: '#3584e4', surface: '#ffffff', 'on-surface': '#222222' }).variant, 'light');
    assert.equal(resolve({ primary: '#3584e4', surface: '#ffffff', 'on-surface': '#222222' }, { variant: 'dark' }).variant, 'dark');
});

test('semantic colors appear only when the palette gives them', () => {
    const plain = resolve({ primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff' });
    assert.equal(plain.colors.destructive, undefined);
    const withOne = resolve({ primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff', success: '#26a269' });
    assert.equal(withOne.colors.success, '#26a269');
    assert.equal(withOne.colors.warning, undefined);
});

test('a pair under the contrast floor is reported as a warning naming both roles', () => {
    const r = resolve({ primary: '#3584e4', 'on-primary': '#3a8ae8', surface: '#1e1e1e', 'on-surface': '#ffffff' });
    const w = r.warnings.find(x => x.startsWith('on-primary on primary'));
    assert.ok(w, JSON.stringify(r.warnings));
    assert.match(w, /under 4\.5:1/);
});

test('the contrast floor matches Conjure Launcher', () => {
    assert.deepEqual(CONTRAST_FLOOR, [['on-primary', 'primary', 4.5], ['on-surface', 'surface', 4.5],
        ['on-hover', 'hover', 4.5], ['on-surface', 'surface-container', 4.5], ['on-surface-variant', 'surface', 3.0]]);
});

test('terminal and fonts pass through, or are null', () => {
    const r = resolve({ primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff' });
    assert.equal(r.terminal, null);
    assert.equal(r.fonts, null);
});

test('resolvePalette does not modify its input', () => {
    const p = parsePalette('t', { name: 'T', colors: { primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff' } });
    const before = JSON.stringify(p);
    resolvePalette(p);
    assert.equal(JSON.stringify(p), before);
});

test('text on secondary and tertiary is derived only when the accent is given', () => {
    const r = resolve({ primary: '#e3c078', surface: '#0b0910', 'on-surface': '#ede4d9', secondary: '#b392d4' });
    assert.equal(r.colors['on-secondary'], '#0b0910');
    assert.ok(r.derived.includes('on-secondary'));
    assert.equal(r.colors.tertiary, undefined);
    assert.equal(r.colors['on-tertiary'], undefined);
});

test('accent pairs that are present are held to 4.5:1', () => {
    const r = resolve({ primary: '#e3c078', surface: '#0b0910', 'on-surface': '#ede4d9', tertiary: '#43e597', 'on-tertiary': '#40e090' });
    assert.ok(r.warnings.some(w => w.startsWith('on-tertiary on tertiary')), JSON.stringify(r.warnings));
});

test('the inactive border is passed through, never derived', () => {
    const plain = resolve({ primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff' });
    assert.equal(plain.colors['inactive-border'], undefined);
    const given = resolve({ primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff', 'inactive-border': '#4a3e52' });
    assert.equal(given.colors['inactive-border'], '#4a3e52');
    assert.ok(!given.derived.includes('inactive-border'));
});
