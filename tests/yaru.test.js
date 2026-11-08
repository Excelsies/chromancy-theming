import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePalette } from '../lib/palette.js';
import { resolvePalette } from '../lib/derive.js';
import {
    markDefaults, gtk3Variables, shellVariables, gtk3Entry, shellEntry, preprocessShellScss, replaceShellAccent,
    overrideBlock, parseSource, patchSassUtils, patchGtk3ButtonText, YaruBuildError,
} from '../lib/yaru.js';

const vendor = p => readFileSync(new URL(`../vendor/yaru/${p}`, import.meta.url), 'utf8');
const builtin = id => resolvePalette(parsePalette(id,
    JSON.parse(readFileSync(new URL(`../data/palettes/${id}.json`, import.meta.url), 'utf8'))));

test('markDefaults adds !default to each definition of the named variables, keeping comments', () => {
    const scss = '$a: 1;\n$b: if($x, 2, 3); // note\n  $a: nested;\n$c: 4;\n$b: 5;\n';
    const { text, counts } = markDefaults(scss, ['b']);
    assert.equal(text, '$a: 1;\n$b: if($x, 2, 3) !default; // note\n  $a: nested;\n$c: 4;\n$b: 5 !default;\n');
    assert.deepEqual(counts, { b: 2 });
});

test('markDefaults leaves other variables and indented (nested) assignments alone', () => {
    const { text } = markDefaults('$bg_color_x: 1;\n  $bg_color: 2;\n', ['bg_color']);
    assert.equal(text, '$bg_color_x: 1;\n  $bg_color: 2;\n');
});

test('markDefaults refuses a definition that spans lines', () => {
    assert.throws(() => markDefaults('$a: map-get(\n  $m, k);\n', ['a']), YaruBuildError);
});

test('the GTK 3 variables come from the palette, semantic ones only when given', () => {
    const v = gtk3Variables(builtin('jeweltone-dark'));
    assert.deepEqual(v, {
        bg_color: '#0b0910', fg_color: '#ede4d9', base_color: '#191420', text_color: '#ede4d9',
        headerbar_color: '#191420', menu_color: '#191420', error_color: '#e8736b',
        // Yaru draws dark-variant backdrop text from white; the same formula on the palette text.
        backdrop_fg_color: 'transparentize(#ede4d9, 0.35)', backdrop_text_color: 'transparentize(#ede4d9, 0.45)',
    });
    assert.equal(gtk3Variables(builtin('jeweltone-light')).backdrop_fg_color, undefined, 'the light variant already uses fg');
    assert.equal(gtk3Variables(builtin('nord')).error_color, undefined);
});

test('the shell variables come from the palette', () => {
    const v = shellVariables(builtin('jeweltone-dark'));
    assert.equal(v.bg_color, '#0b0910');
    assert.equal(v.panel_bg_color, '#0b0910');
    assert.equal(v.card_bg_color, '#191420');
    assert.equal(v.hover_bg_color, '#241c2e');
    assert.equal(v.error_bg_color, '#e8736b');
    assert.ok(/^#[0-9a-f]{6}$/.test(v.error_fg_color));
    assert.equal(v.destructive_bg_color, undefined);
});

test('overrideBlock writes one SCSS assignment per variable', () => {
    assert.equal(overrideBlock({ a: '#000000', b_c: '#ffffff' }), '$a: #000000;\n$b_c: #ffffff;\n');
});

test('the GTK 3 entry sets the palette accent and imports the theme', () => {
    const p = builtin('jeweltone-dark');
    const entry = gtk3Entry(vendor('common/accent-colors.scss.in'), p, '/v/gtk-dark.scss');
    assert.match(entry, /\$yaru_is_dark_variant: true;/);
    assert.match(entry, /\$yaru_accent_bg_color: #e3c078;/);
    assert.match(entry, /\$accent_fg_color: #17120a;/);
    assert.match(entry, /\$yaru_dark_bg: #0b0910;/);
    assert.match(entry, /\$bg_color: #0b0910;\n[\s\S]*@import '\/v\/gtk-dark.scss'/);
    assert.doesNotMatch(entry, /@yaru_|get_accent_color\('/);
});

test('the GTK 3 entry refuses a template that changed shape', () => {
    assert.throws(() => gtk3Entry('$x: 1;\n@import \'@yaru_theme_entry_point@\'', builtin('nord'), '/v/x.scss'), YaruBuildError);
});

test('the shell entry fills the template and puts the overrides before the colors import', () => {
    const entry = shellEntry(vendor('gnome-shell/src/gnome-shell.scss.in'), builtin('jeweltone-light'));
    assert.match(entry, /^\$variant: light;/m);
    assert.match(entry, /^\$use_gresource: true;/m);
    assert.ok(entry.indexOf('$bg_color: #f5efe6;') < entry.indexOf('@import "gnome-shell-sass/_colors"'));
    assert.doesNotMatch(entry, /@[A-Z][A-Za-z]+@/);
});

test('shell sources are preprocessed as Yaru\'s build does', () => {
    assert.equal(preprocessShellScss("a { b: url(x.svg); }\n@import '_default-colors';\n"),
        "a { b: yaru_url_handler(x.svg); }\n@import '_yaru-default-colors.scss';\n");
});

test('replaceShellAccent swaps the runtime accent for the palette colors and counts them', () => {
    const { css, count } = replaceShellAccent('a { color: -st-accent-color; b: -st-accent-fg-color; c: st-lighten(-st-accent-color, 10%); }',
        '#e3c078', '#17120a');
    assert.equal(css, 'a { color: #e3c078; b: #17120a; c: st-lighten(#e3c078, 10%); }');
    assert.equal(count, 3);
});

test('parseSource reads the vendored version', () => {
    assert.deepEqual(parseSource(vendor('SOURCE')), {
        repository: 'https://github.com/ubuntu/yaru',
        commit: 'f01c3e9a257296242806f8e0c5d4a660516f2181',
        version: '26.04.5.1ubuntu',
    });
});

test('every variable Chromancy sets is defined on single lines in the vendored source', () => {
    const p = { ...builtin('jeweltone-dark') };
    p.colors = { ...p.colors, destructive: '#c01c28', success: '#26a269', warning: '#cd9309', error: '#c01c28' };
    const gtk3 = Object.keys(gtk3Variables(p));
    const { counts } = markDefaults(vendor('gtk/src/default/gtk-3.0/_colors.scss'), gtk3);
    for (const name of gtk3)
        assert.equal(counts[name], 1, `gtk3 ${name}`);
    const shellFiles = ['gnome-shell/upstream/theme/gnome-shell-sass/_colors.scss',
        'gnome-shell/upstream/theme/gnome-shell-sass/_default-colors.scss',
        'gnome-shell/src/gnome-shell-sass/_color-overrides.scss'];
    const shell = Object.keys(shellVariables(p));
    const total = Object.fromEntries(shell.map(n => [n, 0]));
    for (const f of shellFiles) {
        for (const [n, c] of Object.entries(markDefaults(vendor(f), shell).counts))
            total[n] += c;
    }
    for (const name of shell)
        assert.ok(total[name] >= 1, `shell ${name} is defined`);
});

test('the vendored optimize-contrast() is patched to try the other direction instead of failing', () => {
    const patched = patchSassUtils(vendor('common/sass-utils.scss'));
    assert.doesNotMatch(patched, /@error "Cannot reach contrast target/);
    assert.match(patched, /\$dark-bg: not \$dark-bg;/);
    assert.throws(() => patchSassUtils(patched), YaruBuildError, 'a second patch finds nothing to replace');
});

test('text on suggested and destructive buttons follows the palette instead of Yaru\'s white', () => {
    const { text, count } = patchGtk3ButtonText(vendor('gtk/src/default/gtk-3.0/_common.scss'));
    assert.equal(count, 7, 'Yaru 26.04.5.1 passes white in 7 places; a different count means Yaru changed');
    assert.doesNotMatch(text, /\$b_color, white\)/);
    const entry = gtk3Entry(vendor('common/accent-colors.scss.in'), builtin('jeweltone-dark'), '/v/gtk-dark.scss');
    assert.match(entry, /@function chromancy-text-on\(\$c\)/);
    assert.match(entry, /@return #17120a;/, 'accent buttons get on-primary');
});

test('the panel, dock and overview take the palette\'s dark color, as Yaru keeps them dark in both variants', () => {
    const dark = shellVariables(builtin('jeweltone-dark'));
    assert.equal(dark.yaru_panel_bg_color, '#0b0910');
    assert.equal(dark.yaru_panel_fg_color, '#ede4d9');
    assert.equal(dark.system_base_color, '#0b0910');
    assert.equal(dark.system_fg_color, '#ede4d9');
    assert.equal(dark.panel_bg_color, '#0b0910');
    const light = shellVariables(builtin('jeweltone-light'));
    assert.equal(light.yaru_panel_bg_color, '#1f1a24', 'the light palette\'s text color, its darkest');
    assert.equal(light.yaru_panel_fg_color, '#f5efe6');
    assert.equal(light.system_base_color, '#1f1a24');
    assert.match(light.system_bg_color, /^mix\(#f5efe6, #1f1a24, 7%\)$/);
});
