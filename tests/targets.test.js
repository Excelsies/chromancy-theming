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
const FAKE_INFO = {
    conjure: { schemaDir: '/s', hasSource: true, hasLock: true },
    plaid: { schemaDir: '/s', keys: ['active-border-color', 'active-border-color-2', 'inactive-border-color', 'inactive-border-color-2', 'scratchpad-border-color'] },
    ptyxis: { profilePath: '/org/gnome/Ptyxis/Profiles/x/', template: 'Background={{term-background}}' },
    btop: { template: 'theme[main_fg]="{{term-foreground}}"' },
    'text-editor': { template: '<x c="{{ansi1}}"/>' },
    templates: { home: '/home/u', templates: [{ name: 'a.tmpl', text: 'chromancy-output: ~/.config/a.conf\nfg={{on-surface}}' }] },
};
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
        for (const op of t.plan(p, { paths: { ...paths, data: '/d' }, gtkTheme: 'Yaru-dark', info: FAKE_INFO[t.id] ?? {} }, { css: '' }))
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

test('gtk3 writes the rebuilt stylesheet and one import line, with images from the active Yaru theme', async () => {
    const { gtk3 } = await import('../lib/targets/gtk3.js');
    assert.equal(gtk3.build, 'gtk3');
    const built = { css: 'a { background: url("assets/x.png"); } b { c: url("assets/check-symbolic.svg"); }' };
    const ops = gtk3.plan(builtin('jeweltone-dark'), { paths, gtkTheme: 'Yaru-purple-dark' }, built);
    const css = ops.find(o => o.kind === 'file');
    assert.equal(css.path, '/home/a.b@example.com/.config/gtk-3.0/chromancy-theming.css');
    assert.match(css.content, /^\/\* Chromancy Theming: Yaru rebuilt with the palette "Jeweltone Dark"/);
    assert.match(css.content, /url\("resource:\/\/\/com\/ubuntu\/themes\/Yaru-purple-dark\/3\.0\/assets\/x\.png"\)/);
    assert.match(css.content, /url\("resource:\/\/\/com\/ubuntu\/themes\/Yaru-purple-dark\/3\.0\/assets\/check-symbolic\.svg"\)/);
    assert.doesNotMatch(css.content, /url\("assets\//);
    const line = ops.find(o => o.kind === 'line');
    assert.equal(line.path, '/home/a.b@example.com/.config/gtk-3.0/gtk.css');
    assert.match(line.line, /^@import url\("file:\/\/\/home\/a\.b%40example\.com\/\.config\/gtk-3\.0\/chromancy-theming\.css"\);/);
});

test('gtk3 refuses a GTK theme that is not Yaru, since the images come from it', async () => {
    const { gtk3 } = await import('../lib/targets/gtk3.js');
    assert.throws(() => gtk3.plan(builtin('nord'), { paths, gtkTheme: 'Adwaita' }, { css: '' }), /Yaru/);
});

test('shell writes the rebuilt shell stylesheet where the helper extension loads it', async () => {
    const { shell, SHELL_STYLESHEET } = await import('../lib/targets/shell.js');
    assert.equal(shell.build, 'shell');
    const ops = shell.plan(builtin('jeweltone-dark'), { paths: { ...paths, data: '/home/u/.local/share' } }, { css: 'stage { }' });
    assert.deepEqual(ops, [{ target: 'shell', kind: 'file', path: `/home/u/.local/share/${SHELL_STYLESHEET}`,
        content: '/* Chromancy Theming: Yaru shell theme rebuilt with the palette "Jeweltone Dark". Rewritten on every Apply. */\nstage { }' }]);
});

test('gtk4 draws separators and shades from the outline color, so they show on very dark surfaces', () => {
    const css = gtk4.plan(builtin('jeweltone-dark'), { paths }).find(o => o.kind === 'file').content;
    for (const v of ['card', 'popover', 'headerbar', 'sidebar', 'secondary-sidebar'])
        assert.match(css, new RegExp(`--${v}-shade-color: #6b5c7799;`), v);
});

test('conjure names itself first, then writes the nine tokens, and the font family when one is chosen', async () => {
    const { conjure } = await import('../lib/targets/conjure.js');
    const p = builtin('jeweltone-dark');
    let ops = conjure.plan(p, { paths, info: FAKE_INFO.conjure });
    assert.deepEqual(ops.map(o => o.key), ['theme-override-source', 'theme-primary', 'theme-on-primary', 'theme-surface',
        'theme-surface-container', 'theme-on-surface', 'theme-on-surface-variant', 'theme-outline-variant', 'theme-hover', 'theme-on-hover']);
    assert.equal(ops[0].value, 'Chromancy Theming');
    assert.equal(ops[1].value, '#e3c078');
    assert.ok(ops.every(o => o.schemaDir === '/s'));
    ops = conjure.plan({ ...p, fonts: { interface: 'Inter Bold 11' } }, { paths, info: { ...FAKE_INFO.conjure, hasSource: false } });
    assert.equal(ops[0].key, 'theme-primary', 'an older Conjure without the source key is not sent one');
    assert.deepEqual(ops.at(-1), { ...ops.at(-1), key: 'theme-font-family', value: 'Inter' });
});

test('conjure honors its lock', async () => {
    const { conjure } = await import('../lib/targets/conjure.js');
    const sys = locked => ({ system: { readSetting: async ref => ({ value: ref.key === 'theme-overrides-locked' ? locked : null }) } });
    assert.equal(await conjure.lock(sys(true), FAKE_INFO.conjure), true);
    assert.equal(await conjure.lock(sys(false), FAKE_INFO.conjure), false);
    await assert.rejects(conjure.lock({ system: { readSetting: async () => { throw new Error('dconf'); } } }, FAKE_INFO.conjure));
});

test('plaid sets the borders it has keys for, as one-color lists', async () => {
    const { plaid } = await import('../lib/targets/plaid.js');
    const ops = plaid.plan(builtin('jeweltone-dark'), { paths, info: FAKE_INFO.plaid });
    assert.deepEqual(Object.fromEntries(ops.map(o => [o.key, o.value])), {
        'active-border-color': ['#e3c078'], 'active-border-color-2': ['#b392d4'],
        'inactive-border-color': ['#4a3e52'], 'inactive-border-color-2': ['#4a3e52'], 'scratchpad-border-color': ['#43e597'],
    });
    const older = plaid.plan(builtin('nord'), { paths, info: { schemaDir: '/s', keys: ['active-border-color', 'inactive-border-color'] } });
    assert.deepEqual(older.map(o => o.key), ['active-border-color', 'inactive-border-color']);
    assert.equal(older[1].value[0], builtin('nord').colors['outline-variant'], 'no inactive border: the outline color');
});

test('flatpak adds read-only grants for the GTK stylesheets to the global overrides', async () => {
    const { flatpak } = await import('../lib/targets/flatpak.js');
    assert.deepEqual(flatpak.plan(null, { paths: { data: '/home/u/.local/share' } }), [{ target: 'flatpak', kind: 'ini-list',
        path: '/home/u/.local/share/flatpak/overrides/global', group: 'Context', key: 'filesystems', items: ['xdg-config/gtk-4.0:ro', 'xdg-config/gtk-3.0:ro'] }]);
});

test('qt writes a qt6ct color scheme in qt6ct\'s own format, selects it, and sets the platform theme', async () => {
    const { qt, qtColorScheme } = await import('../lib/targets/qt.js');
    const scheme = qtColorScheme(builtin('jeweltone-dark'));
    const bundled = readFileSync(new URL('fixtures/qt6ct/simple.conf', import.meta.url), 'utf8');
    const shape = text => text.split('\n').filter(Boolean).map(l => l.replace(/#[0-9a-f]{8}/gi, 'C'));
    assert.deepEqual(shape(scheme), shape(bundled.replace(/#80000000/, '#ff000000')), 'same keys, 21 ARGB colors each');
    const active = scheme.split('\n')[1].split('=')[1].split(', ');
    assert.equal(active[0], '#ffede4d9', 'window text');
    assert.equal(active[10], '#ff0b0910', 'window');
    assert.equal(active[12], '#ffe3c078', 'highlight');
    assert.equal(active[13], '#ff17120a', 'highlighted text');
    const ops = qt.plan({ ...builtin('jeweltone-dark'), fonts: { monospace: 'JetBrains Mono 10' } }, { paths });
    assert.deepEqual(ops.filter(o => o.kind === 'ini').map(o => `${o.group}/${o.key}=${o.value}`), [
        `Appearance/color_scheme_path=${paths.config}/qt6ct/colors/chromancy-theming.conf`, 'Appearance/custom_palette=true',
        'Fonts/fixed="JetBrains Mono,10,-1,5,400,0,0,0,0,0,0,0,0,0,0,1"']);
    assert.equal(ops.at(-1).path, `${paths.config}/environment.d/chromancy-theming.conf`);
    assert.match(ops.at(-1).content, /^QT_QPA_PLATFORMTHEME=qt6ct$/m);
});

test('the terminal apps fill their templates and select the result', async () => {
    const { ptyxis, btop, textEditor } = await import('../lib/targets/apps.js');
    const p = builtin('jeweltone-dark');
    const pt = ptyxis.plan(p, { paths: { ...paths, data: '/d' }, info: FAKE_INFO.ptyxis });
    assert.equal(pt[0].content, 'Background=#0b0910');
    assert.equal(pt[0].path, '/d/org.gnome.Ptyxis/palettes/Chromancy-jeweltone-dark.palette', 'a Ptyxis palette per Chromancy palette');
    assert.deepEqual([pt[1].schema, pt[1].path, pt[1].key, pt[1].value], ['org.gnome.Ptyxis.Profile', '/org/gnome/Ptyxis/Profiles/x/', 'palette', 'Chromancy-jeweltone-dark']);
    const bt = btop.plan(p, { paths, info: FAKE_INFO.btop });
    assert.deepEqual([bt[1].kind, bt[1].group, bt[1].key, bt[1].value], ['ini', null, 'color_theme', '"chromancy-theming"']);
    const te = textEditor.plan(p, { paths: { ...paths, data: '/d' }, info: FAKE_INFO['text-editor'] });
    assert.equal(te[0].path, '/d/gtksourceview-5/styles/chromancy-theming.xml');
    assert.deepEqual([te[1].key, te[1].value], ['style-scheme', 'chromancy-theming']);
});

test('a palette without terminal colors is skipped by the terminal apps, not failed', async () => {
    const { btop } = await import('../lib/targets/apps.js');
    const { TargetSkipped } = await import('../lib/targets/common.js');
    assert.throws(() => btop.plan(builtin('noctalia'), { paths, info: FAKE_INFO.btop }), TargetSkipped);
});

test('the bundled templates render with every built-in palette that has terminal colors', async () => {
    const { render, templateVars } = await import('../lib/template.js');
    const { readdirSync } = await import('node:fs');
    const dir = new URL('../data/templates/', import.meta.url);
    for (const t of readdirSync(dir)) {
        const text = readFileSync(new URL(t, dir), 'utf8');
        for (const id of ['jeweltone-dark', 'jeweltone-light', 'nord', 'tokyo-night'])
            assert.doesNotMatch(render(text, { ...templateVars(builtin(id)), 'ptyxis-id': 'x' }), /\{\{|undefined/, `${t} with ${id}`);
    }
});

test('a user template writes to the path its first line names, only inside home', async () => {
    const { userTemplates, outputPath } = await import('../lib/targets/userTemplates.js');
    const ops = userTemplates.plan(builtin('jeweltone-dark'), { paths, info: FAKE_INFO.templates });
    assert.deepEqual(ops, [{ target: 'templates', kind: 'file', path: '/home/u/.config/a.conf', content: 'fg=#ede4d9' }]);
    assert.deepEqual(outputPath('chromancy-output: /etc/passwd\n', '/home/u'), { error: 'the output must be inside /home/u' });
    assert.deepEqual(outputPath('chromancy-output: ~/../../etc/x\n', '/home/u'), { error: 'the output must be inside /home/u' });
    assert.deepEqual(outputPath('chromancy-output: ~/a/./b/../c\n', '/home/u'), { path: '/home/u/a/c' });
    assert.ok(outputPath('no header\n', '/home/u').error);
    assert.throws(() => userTemplates.plan(builtin('jeweltone-dark'), { paths,
        info: { home: '/home/u', templates: [{ name: 'bad.tmpl', text: 'chromancy-output: ~/x\n{{nope}}' }] } }), /bad\.tmpl: unknown placeholder nope/);
});

test('gtk3 writes the recolored accent images and points only those at them', async () => {
    const { gtk3 } = await import('../lib/targets/gtk3.js');
    const built = { css: 'a { b: -gtk-scaled(url("assets/text-select-end-active.png"), url("assets/text-select-end-active@2.png")); c: url("assets/check-symbolic.svg"); }',
        assets: { 'text-select-end-active.png': 'AAAA', 'text-select-end-active@2.png': 'BBBB' } };
    const ops = gtk3.plan(builtin('jeweltone-dark'), { paths: { ...paths, data: '/home/u/.local/share' }, gtkTheme: 'Yaru-purple-dark' }, built);
    const images = ops.filter(o => o.encoding === 'base64');
    assert.deepEqual(images.map(o => [o.path, o.content]), [
        ['/home/u/.local/share/chromancy-theming/gtk-3.0/assets/text-select-end-active.png', 'AAAA'],
        ['/home/u/.local/share/chromancy-theming/gtk-3.0/assets/text-select-end-active@2.png', 'BBBB']]);
    const css = ops.find(o => o.path.endsWith('chromancy-theming.css')).content;
    assert.match(css, /url\("file:\/\/\/home\/u\/\.local\/share\/chromancy-theming\/gtk-3\.0\/assets\/text-select-end-active\.png"\)/);
    assert.match(css, /url\("file:\/\/\/home\/u\/\.local\/share\/chromancy-theming\/gtk-3\.0\/assets\/text-select-end-active%402\.png"\)/, '"@" is escaped in the URL');
    assert.match(css, /url\("resource:\/\/\/com\/ubuntu\/themes\/Yaru-purple-dark\/3\.0\/assets\/check-symbolic\.svg"\)/);
});
