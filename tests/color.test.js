import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, normalizeColor, formatColor, contrast, mix, textOn } from '../lib/color.js';

test('parseColor accepts #rgb, #rrggbb and #rrggbbaa in any case', () => {
    assert.deepEqual(parseColor('#fA0'), { r: 255, g: 170, b: 0, a: 1 });
    assert.deepEqual(parseColor('#FFAA00'), { r: 255, g: 170, b: 0, a: 1 });
    assert.deepEqual(parseColor('#ffaa0080'), { r: 255, g: 170, b: 0, a: 128 / 255 });
});

test('parseColor rejects everything else', () => {
    for (const bad of ['', 'ffaa00', '#ffaa0', '#ffaa000', '#gggggg', 'red', ' #ffaa00', '#ffaa00 ', null, undefined, 42])
        assert.equal(parseColor(bad), null, `accepted ${JSON.stringify(bad)}`);
});

test('normalizeColor writes lowercase #rrggbb, keeping alpha only when it is not opaque', () => {
    assert.equal(normalizeColor('#FA0'), '#ffaa00');
    assert.equal(normalizeColor('#FFAA00FF'), '#ffaa00');
    assert.equal(normalizeColor('#FFAA0080'), '#ffaa0080');
    assert.equal(normalizeColor('blue'), null);
});

test('formatColor round-trips parseColor', () => {
    for (const hex of ['#000000', '#ffffff', '#123456', '#12345678'])
        assert.equal(formatColor(parseColor(hex)), hex);
});

test('contrast follows WCAG 2.x', () => {
    assert.equal(contrast('#000000', '#ffffff'), 21);
    assert.equal(contrast('#ffffff', '#ffffff'), 1);
    // Symmetric.
    assert.equal(contrast('#767676', '#ffffff'), contrast('#ffffff', '#767676'));
    // #767676 on white is the well-known 4.54:1.
    assert.equal(contrast('#767676', '#ffffff').toFixed(2), '4.54');
});

test('contrast composites a translucent foreground over the background first', () => {
    // 50% black over white is #808080 (rounded), not black.
    assert.equal(contrast('#00000080', '#ffffff').toFixed(2), contrast('#7f7f7f', '#ffffff').toFixed(2));
});

test('mix moves from the first color toward the second', () => {
    assert.equal(mix('#000000', '#ffffff', 0), '#000000');
    assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
    assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
    assert.equal(mix('#ff0000', '#0000ff', 0.25), '#bf0040');
});

test('textOn picks the own text color with the best contrast when it reaches 4.5:1', () => {
    assert.equal(textOn('#e3c078', ['#ede4d9', '#0b0910']), '#0b0910');
    assert.equal(textOn('#241c2e', ['#ede4d9', '#0b0910']), '#ede4d9');
});

test('textOn falls back to black or white when no own color reaches 4.5:1', () => {
    // Mid grey fill: both own colors are too close to it.
    assert.equal(textOn('#777777', ['#888888', '#666666']), '#000000');
    assert.equal(textOn('#555555', ['#666666', '#444444']), '#ffffff');
});
