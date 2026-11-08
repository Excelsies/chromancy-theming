import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePalette } from '../lib/palette.js';
import { resolvePalette } from '../lib/derive.js';
import { LINE_MARKER } from '../lib/applier.js';
import { TARGETS } from '../lib/targets/index.js';
import { gtk4, fileUrl } from '../lib/targets/gtk4.js';
import { fonts } from '../lib/targets/fonts.js';
import { style } from '../lib/targets/style.js';

const paths = { config: '/home/a.b@example.com/.config' };
const builtin = id => resolvePalette(parsePalette(id,
    JSON.parse(readFileSync(new URL(`../data/palettes/${id}.json`, import.meta.url), 'utf8'))));
const minimal = (extra = {}) => resolvePalette(parsePalette('m', {
    name: 'M', colors: { primary: '#3584e4', surface: '#1e1e1e', 'on-surface': '#ffffff', ...extra.colors }, ...extra.top,
}));

test('every target has an id, a title, a plan function and declares its lock', () => {
    const ids = new Set();
    for (const t of TARGETS) {
        assert.match(t.id, /^[a-z0-9-]+$/);
        assert.ok(!ids.has(t.id), `duplicate ${t.id}`);
        ids.add(t.id);
        assert.equal(typeof t.title, 'string');
        assert.equal(typeof t.plan, 'function');
        assert.ok(t.lock === 'none' || typeof t.lock === 'function', `${t.id}: lock must be 'none' or a reader`);
    }
});

test('every op a target plans is tagged with that target', () => {
    const p = builtin('jeweltone-dark');
    for (const t of TARGETS) {
        for (const op of t.plan(p, { paths }))
            assert.equal(op.target, t.id);
    }
});

test('gtk4 writes its stylesheet and one import line in gtk.css with an absolute, escaped file URL', () => {
    const ops = gtk4.plan(builtin('jeweltone-dark'), { paths });
    const css = ops.find(o => o.kind === 'file');
    assert.equal(css.path, '/home/a.b@example.com/.config/gtk-4.0/chromancy-theming.css');
    const line = ops.find(o => o.kind === 'line');
    assert.equal(line.path, '/home/a.b@example.com/.config/gtk-4.0/gtk.css');
    assert.equal(line.line,
        `@import url("file:///home/a.b%40example.com/.config/gtk-4.0/chromancy-theming.css"); ${LINE_MARKER}`);
});

test('fileUrl escapes characters a URL cannot hold', () => {
    assert.equal(fileUrl('/a b/c#d/e%f'), 'file:///a%20b/c%23d/e%25f');
});

test('gtk4 sets the libadwaita variables from the palette', () => {
    const p = builtin('jeweltone-dark');
    const css = gtk4.plan(p, { paths }).find(o => o.kind === 'file').content;
    const decl = name => new RegExp(`${name}: ([^;]+);`).exec(css)?.[1];
    assert.equal(decl('--accent-bg-color'), '#e3c078');
    assert.equal(decl('--accent-fg-color'), '#17120a');
    assert.equal(decl('--yaru-accent-bg-color'), '#e3c078', 'Ubuntu sets its own accent variable');
    assert.equal(decl('--window-bg-color'), '#0b0910');
    assert.equal(decl('--window-fg-color'), '#ede4d9');
    assert.equal(decl('--popover-bg-color'), '#191420');
    assert.equal(decl('--headerbar-bg-color'), '#191420');
    assert.equal(decl('--border-color'), '#6b5c77');
    assert.equal(decl('--error-bg-color'), '#e8736b', 'Jeweltone gives an error color');
    // Ubuntu's stylesheet sets --accent-color to its own purple, so it must be set; libadwaita's
    // own rule derives it from the background accent.
    assert.equal(decl('--accent-color'), 'oklab(from var(--accent-bg-color) var(--standalone-color-oklab))');
});

test('gtk4 also defines the named colors older app stylesheets use', () => {
    const css = gtk4.plan(builtin('jeweltone-dark'), { paths }).find(o => o.kind === 'file').content;
    assert.match(css, /@define-color accent_bg_color #e3c078;/);
    assert.match(css, /@define-color window_bg_color #0b0910;/);
    assert.match(css, /@define-color popover_bg_color #191420;/);
});

test('gtk4 leaves the semantic colors alone when the palette has none', () => {
    const css = gtk4.plan(minimal(), { paths }).find(o => o.kind === 'file').content;
    for (const name of ['destructive', 'success', 'warning', 'error'])
        assert.doesNotMatch(css, new RegExp(`--${name}-bg-color`), name);
});

test('gtk4 gives each semantic color it sets a readable text color', () => {
    const css = gtk4.plan(minimal({ colors: { success: '#26a269' } }), { paths }).find(o => o.kind === 'file').content;
    assert.match(css, /--success-bg-color: #26a269;/);
    assert.match(css, /--success-fg-color: #(000000|ffffff|1e1e1e);/);
});

test('fonts sets only the fonts the palette gives', () => {
    assert.deepEqual(fonts.plan(minimal(), { paths }), []);
    const ops = fonts.plan(minimal({ top: { fonts: { interface: 'Inter 11', monospace: 'JetBrains Mono 10' } } }), { paths });
    assert.deepEqual(ops.map(o => [o.schema, o.key, o.value]), [
        ['org.gnome.desktop.interface', 'font-name', 'Inter 11'],
        ['org.gnome.desktop.interface', 'monospace-font-name', 'JetBrains Mono 10'],
    ]);
});

test('style sets GNOME\'s light/dark preference from the palette variant', () => {
    const [dark] = style.plan(builtin('jeweltone-dark'), { paths });
    assert.deepEqual([dark.schema, dark.key, dark.value], ['org.gnome.desktop.interface', 'color-scheme', 'prefer-dark']);
    const [light] = style.plan(builtin('jeweltone-light'), { paths });
    assert.equal(light.value, 'default');
});
