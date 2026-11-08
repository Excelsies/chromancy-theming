// Applies a list of operations (write a file, own one line of a shared file, set a setting) and
// restores them later. The I/O is done by a `system` object (app/system.js in the app); this
// module holds the rules:
//
// - Before the first change to a subject, its current state is saved in the ledger as the baseline.
//   If the ledger cannot be saved, nothing is written.
// - An op whose subject already has the wanted state is "unchanged" and is not written.
// - A failed op fails alone; the others still run. Its result names the subject and the error.
// - Restore returns each subject to its baseline even if something changed it since, and reports
//   that it overwrote a change. A managed line is the exception: restore removes only that line,
//   so the rest of the shared file keeps whatever the user wrote after Apply.
// - With `targets`, apply also restores the subjects those targets wrote before and no longer
//   write (a palette without fonts after one with fonts).
// - A ledger that cannot be read or parsed refuses both apply and restore (LedgerError).
//
// Ops:  {target, kind: 'file', path, content: string | null}     null removes the file
//       {target, kind: 'line', path, line}                        line must contain LINE_MARKER
//       {target, kind: 'setting', schema, key, schemaDir?, value}

import { LedgerError, parseLedger, sameState, serializeLedger, subjectOf } from './ledger.js';

/** Marks the one line Chromancy owns in a shared file. */
export const LINE_MARKER = '/* chromancy-theming */';

function refOf(op) {
    if (op.kind === 'setting')
        return { schema: op.schema, key: op.key, ...(op.schemaDir ? { schemaDir: op.schemaDir } : {}) };
    return { path: op.path };
}

const isFileKind = kind => kind === 'file' || kind === 'line';

async function readState(system, kind, ref) {
    if (isFileKind(kind))
        return { content: await system.readText(ref.path) };
    return system.readSetting(ref);
}

async function writeState(system, kind, ref, state) {
    if (isFileKind(kind)) {
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

/** The text without Chromancy's marked line(s). */
export function withoutLine(text) {
    return text.split('\n').filter(l => !l.includes(LINE_MARKER)).join('\n');
}

/** The text with `line` as its first line, replacing any marked line. */
export function withLine(text, line) {
    const rest = text === null ? '' : withoutLine(text);
    return rest === '' ? `${line}\n` : `${line}\n${rest}`;
}

function wanted(op, current) {
    if (op.kind === 'file')
        return { content: op.content };
    if (op.kind === 'line')
        return { content: withLine(current.content, op.line) };
    return { value: op.value, userSet: true };
}

function validate(op) {
    if (op.kind === 'line' && (typeof op.line !== 'string' || !op.line.includes(LINE_MARKER) || op.line.includes('\n')))
        throw new Error(`a managed line must be one line containing ${LINE_MARKER}`);
    if (!['file', 'line', 'setting'].includes(op.kind))
        throw new Error(`unknown op kind ${JSON.stringify(op.kind)}`);
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

/** What restoring an entry should leave, given the subject's current state. */
function restoredState(entry, current) {
    if (entry.kind !== 'line')
        return entry.baseline;
    if (current.content === null)
        return { content: null };
    const rest = withoutLine(current.content);
    return { content: rest === '' && entry.baseline.content === null ? null : rest };
}

async function restoreEntry(system, ledger, save, subject, entry) {
    const result = { target: entry.target, subject };
    let current;
    try {
        current = await readState(system, entry.kind, entry.ref);
    } catch (e) {
        return Object.assign(result, { status: 'failed', error: `read: ${message(e)}` });
    }
    const goal = restoredState(entry, current);
    if (sameState(entry.kind, current, goal)) {
        result.status = 'unchanged';
    } else {
        result.overwrote = entry.kind === 'line'
            ? !(current.content ?? '').includes(entry.written?.line ?? LINE_MARKER)
            : entry.written === null || !sameState(entry.kind, current, entry.written);
        try {
            await writeState(system, entry.kind, entry.ref, goal);
            result.status = 'restored';
        } catch (e) {
            return Object.assign(result, { status: 'failed', error: `write: ${message(e)}` });
        }
    }
    delete ledger.entries[subject];
    await save();
    return result;
}

/**
 * @param {object[]} ops
 * @param {{system: object, ledgerPath: string, targets?: string[]}} ctx with `targets`, subjects those
 *   targets wrote before and are not in `ops` are restored
 * @returns {Promise<{results: {target: string, subject: string, status: 'applied' | 'unchanged' | 'restored' | 'failed',
 *   error?: string, overwrote?: boolean}[]}>}
 * @throws {LedgerError}
 */
export async function apply(ops, { system, ledgerPath, targets }) {
    const ledger = await loadLedger(system, ledgerPath);
    const save = saver(system, ledgerPath, ledger);
    const results = [];
    const planned = new Set();
    for (const op of ops) {
        const ref = op.kind === 'setting' || op.path !== undefined ? refOf(op) : {};
        const subject = subjectOf(op.kind === 'line' ? 'file' : op.kind, ref);
        planned.add(subject);
        const result = { target: op.target, subject };
        results.push(result);
        try {
            validate(op);
        } catch (e) {
            Object.assign(result, { status: 'failed', error: message(e) });
            continue;
        }

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
        const want = wanted(op, current);
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
        entry.kind = op.kind;
        entry.written = op.kind === 'line' ? { line: op.line } : want;
        await save();
    }
    if (targets) {
        for (const [subject, entry] of Object.entries(ledger.entries)) {
            if (targets.includes(entry.target) && !planned.has(subject))
                results.push(await restoreEntry(system, ledger, save, subject, entry));
        }
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
        results.push(await restoreEntry(system, ledger, save, subject, entry));
    }
    return { results };
}
