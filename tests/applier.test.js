import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarios } from './shared/applierScenarios.js';
import { memoryEnv } from './helpers/memorySystem.js';
import { parseLedger, serializeLedger, LedgerError } from '../lib/ledger.js';

const t = {
    equal: (a, b, msg) => assert.equal(a, b, msg),
    deepEqual: (a, b, msg) => assert.deepEqual(a, b, msg),
    ok: (v, msg) => assert.ok(v, msg),
    rejects: (p, re, msg) => assert.rejects(p, re, msg),
};

for (const s of scenarios)
    test(s.name, () => s.run(memoryEnv(), t));

test('a missing ledger is an empty one', () => {
    assert.deepEqual(parseLedger(null), { version: 1, entries: {} });
});

test('a ledger round-trips', () => {
    const l = { version: 1, entries: { 'file:/a': { target: 'gtk4', kind: 'file', ref: { path: '/a' }, baseline: { content: null }, written: { content: 'x' } } } };
    assert.deepEqual(parseLedger(serializeLedger(l)), l);
});

test('a ledger that is not JSON, the wrong shape or a newer version is refused', () => {
    for (const text of ['{not json', '[]', '{"version":1}', '{"version":2,"entries":{}}', '{"version":1,"entries":[]}'])
        assert.throws(() => parseLedger(text), LedgerError, text);
});
