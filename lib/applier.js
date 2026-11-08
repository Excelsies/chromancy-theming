// Applies a list of operations (write a file, set a setting) and restores them later. The I/O is
// done by a `system` object (app/system.js in the app); this module holds the rules:
//
// - Before the first change to a subject, its current state is saved in the ledger as the baseline.
//   If the ledger cannot be saved, nothing is written.
// - An op whose subject already has the wanted state is "unchanged" and is not written.
// - A failed op fails alone; the others still run. Its result names the subject and the error.
// - Restore returns each subject to its baseline even if something changed it since, and reports
//   that it overwrote a change.
// - A ledger that cannot be read or parsed refuses both apply and restore (LedgerError).
//
// Ops:  {target, kind: 'file', path, content: string | null}
//       {target, kind: 'setting', schema, key, schemaDir?, value}

import { LedgerError, parseLedger, sameState, serializeLedger, subjectOf } from './ledger.js';

function refOf(op) {
    return op.kind === 'file'
        ? { path: op.path }
        : { schema: op.schema, key: op.key, ...(op.schemaDir ? { schemaDir: op.schemaDir } : {}) };
}

async function readState(system, kind, ref) {
    if (kind === 'file')
        return { content: await system.readText(ref.path) };
    return system.readSetting(ref);
}

async function writeState(system, kind, ref, state) {
    if (kind === 'file') {
        if (state.content === null)
            await system.remove(ref.path);
        else
            await system.writeText(ref.path, state.content);
    } else if (state.userSet) {
        await system.writeSetting(ref, state.value);
    } else {
        await system.resetSetting(ref);
    }
}

function wanted(op) {
    return op.kind === 'file' ? { content: op.content } : { value: op.value, userSet: true };
}

async function loadLedger(system, ledgerPath) {
    let text;
    try {
        text = await system.readText(ledgerPath);
    } catch (e) {
        throw new LedgerError(`cannot read ${ledgerPath}: ${e.message}`, { cause: e });
    }
    return parseLedger(text);
}

function saver(system, ledgerPath, ledger) {
    return async () => {
        try {
            await system.writeText(ledgerPath, serializeLedger(ledger));
        } catch (e) {
            throw new LedgerError(`cannot save ${ledgerPath}: ${e.message}`, { cause: e });
        }
    };
}

const message = e => (e instanceof Error ? e.message : String(e));

/**
 * @param {object[]} ops
 * @param {{system: object, ledgerPath: string}} ctx
 * @returns {Promise<{results: {target: string, subject: string, status: 'applied' | 'unchanged' | 'failed', error?: string}[]}>}
 * @throws {LedgerError}
 */
export async function apply(ops, { system, ledgerPath }) {
    const ledger = await loadLedger(system, ledgerPath);
    const save = saver(system, ledgerPath, ledger);
    const results = [];
    for (const op of ops) {
        const ref = refOf(op);
        const subject = subjectOf(op.kind, ref);
        const result = { target: op.target, subject };
        results.push(result);

        let current;
        try {
            current = await readState(system, op.kind, ref);
        } catch (e) {
            Object.assign(result, { status: 'failed', error: `read: ${message(e)}` });
            continue;
        }
        let entry = ledger.entries[subject];
        if (!entry) {
            entry = { target: op.target, kind: op.kind, ref, baseline: current, written: null };
            ledger.entries[subject] = entry;
            await save();
        }
        const want = wanted(op);
        if (sameState(op.kind, current, want)) {
            result.status = 'unchanged';
        } else {
            try {
                await writeState(system, op.kind, ref, want);
                result.status = 'applied';
            } catch (e) {
                Object.assign(result, { status: 'failed', error: `write: ${message(e)}` });
                continue;
            }
        }
        entry.target = op.target;
        entry.written = want;
        await save();
    }
    return { results };
}

/**
 * @param {{system: object, ledgerPath: string, targets?: string[]}} ctx limit to these targets when given
 * @returns {Promise<{results: {target: string, subject: string, status: 'restored' | 'unchanged' | 'failed',
 *   overwrote?: boolean, error?: string}[]}>}
 * @throws {LedgerError}
 */
export async function restore({ system, ledgerPath, targets }) {
    const ledger = await loadLedger(system, ledgerPath);
    const save = saver(system, ledgerPath, ledger);
    const results = [];
    for (const [subject, entry] of Object.entries(ledger.entries)) {
        if (targets && !targets.includes(entry.target))
            continue;
        const result = { target: entry.target, subject };
        results.push(result);
        let current;
        try {
            current = await readState(system, entry.kind, entry.ref);
        } catch (e) {
            Object.assign(result, { status: 'failed', error: `read: ${message(e)}` });
            continue;
        }
        if (sameState(entry.kind, current, entry.baseline)) {
            result.status = 'unchanged';
        } else {
            result.overwrote = entry.written === null || !sameState(entry.kind, current, entry.written);
            try {
                await writeState(system, entry.kind, entry.ref, entry.baseline);
                result.status = 'restored';
            } catch (e) {
                Object.assign(result, { status: 'failed', error: `write: ${message(e)}` });
                continue;
            }
        }
        delete ledger.entries[subject];
        await save();
    }
    return { results };
}
