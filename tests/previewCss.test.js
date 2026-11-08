import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardCss, previewCss } from '../lib/previewCss.js';
import { parsePalette } from '../lib/palette.js';
import { resolvePalette } from '../lib/derive.js';

const load = id => resolvePalette(parsePalette(id, JSON.parse(readFileSync(new URL(`../data/palettes/${id}.json`, import.meta.url), 'utf8'))));

test('card rules are scoped to the palette\'s own class', () => {
    const css = cardCss(load('jeweltone-dark'));
    for (const line of css.split('\n'))
        assert.match(line, /^\.cp-card-jeweltone-dark /);
    assert.match(css, /\.cp-dot-0 \{ background-color: #e3c078;/);
    assert.match(css, /\.cp-dot-1 \{ background-color: #b392d4;/, 'secondary when the palette has one');
});

test('preview rules are scoped to the preview and use the palette', () => {
    const css = previewCss(load('nord'));
    for (const line of css.split('\n'))
        assert.match(line, /^\.chromancy-preview/);
    assert.match(css, /\.cp-button \{ background-color: #[0-9a-f]{6}; color: #[0-9a-f]{6};/);
    assert.doesNotMatch(css, /undefined/);
});
