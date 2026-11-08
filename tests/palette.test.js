import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePalette, PaletteError } from '../lib/palette.js';

const MIN = { name: 'Test', colors: { primary: '#3584E4', surface: '#1E1E1E', 'on-surface': '#FFFFFF' } };
const clone = o => JSON.parse(JSON.stringify(o));

function rejects(id, obj, path) {
    assert.throws(() => parsePalette(id, obj), err => {
        assert.ok(err instanceof PaletteError, `not a PaletteError: ${err}`);
        assert.equal(err.path, path);
        assert.ok(err.message.startsWith(`${path}: `), err.message);
        return true;
    });
}

test('a palette with only the three required colors parses, with colors normalized', () => {
    const p = parsePalette('test', MIN);
    assert.deepEqual(p, {
        id: 'test', name: 'Test', variant: null,
        colors: { primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff' },
        terminal: null, fonts: null,
    });
});

test('every optional section parses', () => {
    const p = parsePalette('full', {
        name: 'Full', variant: 'dark',
        colors: { ...MIN.colors, 'on-primary': '#000', hover: '#333333', destructive: '#c01c28' },
        terminal: { background: '#000000', foreground: '#ffffff', cursor: '#ffcc00', 'cursor-text': '#000000',
            ansi: Array(16).fill('#123456') },
        fonts: { interface: 'Ubuntu Sans 11', monospace: 'Ubuntu Sans Mono 10.5' },
    });
    assert.equal(p.variant, 'dark');
    assert.equal(p.colors['on-primary'], '#000000');
    assert.equal(p.colors.destructive, '#c01c28');
    assert.equal(p.terminal.cursor, '#ffcc00');
    assert.equal(p.terminal['cursor-text'], '#000000');
    assert.equal(p.terminal.ansi.length, 16);
    assert.deepEqual(p.fonts, { interface: 'Ubuntu Sans 11', monospace: 'Ubuntu Sans Mono 10.5' });
});

test('the id must be a lowercase slug', () => {
    for (const id of ['', 'Test', 'a b', '-a', 'a/b', '../x', 'é'])
        rejects(id, MIN, 'id');
});

test('the palette must be an object with a name', () => {
    rejects('t', null, '(palette)');
    rejects('t', [], '(palette)');
    rejects('t', { colors: MIN.colors }, 'name');
    rejects('t', { ...MIN, name: '  ' }, 'name');
});

test('each required color is named when missing', () => {
    for (const role of ['primary', 'surface', 'on-surface']) {
        const p = clone(MIN);
        delete p.colors[role];
        rejects('t', p, `colors.${role}`);
    }
});

test('a bad color names its key', () => {
    const p = clone(MIN);
    p.colors.hover = 'blue';
    rejects('t', p, 'colors.hover');
});

test('unknown keys are refused, so a typo is not silently ignored', () => {
    rejects('t', { ...MIN, colour: {} }, 'colour');
    rejects('t', { ...MIN, colors: { ...MIN.colors, primay: '#ffffff' } }, 'colors.primay');
    rejects('t', { ...MIN, fonts: { interfce: 'Sans 11' } }, 'fonts.interfce');
    rejects('t', { ...MIN, terminal: { background: '#000', foreground: '#fff', ansi: Array(16).fill('#000'), bg: '#000' } }, 'terminal.bg');
});

test('variant is dark or light', () => {
    rejects('t', { ...MIN, variant: 'dim' }, 'variant');
});

test('terminal needs background, foreground and exactly 16 ANSI colors', () => {
    const t = { background: '#000', foreground: '#fff', ansi: Array(16).fill('#000') };
    rejects('t', { ...MIN, terminal: { ...t, background: undefined } }, 'terminal.background');
    rejects('t', { ...MIN, terminal: { ...t, ansi: Array(15).fill('#000') } }, 'terminal.ansi');
    const bad = Array(16).fill('#000');
    bad[9] = 'nope';
    rejects('t', { ...MIN, terminal: { ...t, ansi: bad } }, 'terminal.ansi[9]');
});

test('a font is a Pango description ending in a size', () => {
    rejects('t', { ...MIN, fonts: { interface: 'Ubuntu Sans' } }, 'fonts.interface');
    rejects('t', { ...MIN, fonts: { document: '' } }, 'fonts.document');
    rejects('t', { ...MIN, fonts: { monospace: 12 } }, 'fonts.monospace');
    assert.equal(parsePalette('t', { ...MIN, fonts: { interface: 'Cantarell Bold Italic 10' } }).fonts.interface,
        'Cantarell Bold Italic 10');
});

test('secondary and tertiary colors, with their text colors, are optional roles', () => {
    const p = parsePalette('t', { ...MIN, colors: { ...MIN.colors, secondary: '#b392d4', 'on-tertiary': '#04140c', tertiary: '#43e597' } });
    assert.equal(p.colors.secondary, '#b392d4');
    assert.equal(p.colors.tertiary, '#43e597');
    assert.equal(p.colors['on-tertiary'], '#04140c');
});

test('a text color for an accent the palette does not have is refused', () => {
    rejects('t', { ...MIN, colors: { ...MIN.colors, 'on-secondary': '#000000' } }, 'colors.on-secondary');
});
