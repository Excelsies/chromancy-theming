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
// - Restore undoes in the reverse order of apply.
// - A ledger that cannot be read or parsed refuses both apply and restore (LedgerError).
//
// Ops:  {target, kind: 'file', path, content: string | null}     null removes the file
//       {target, kind: 'line', path, line}                        line must contain LINE_MARKER
//       {target, kind: 'ini', path, group, key, value}            one key of an INI file; restore puts
//                                                                 back only that key (group null: top level)
//       {target, kind: 'ini-list', path, group, key, items}       items in a ';'-separated list key;
//                                                                 restore removes only the ones it added
//       {target, kind: 'setting', schema, key, path?, schemaDir?, value}   path: relocatable schemas

import { getIni, isEmptyIni, setIni } from './ini.js';
import { LedgerError, parseLedger, sameState, serializeLedger, subjectOf } from './ledger.js';

/** Marks the one line Chromancy owns in a shared file. */
export const LINE_MARKER = '/* chromancy-theming */';

function refOf(op) {
    if (op.kind === 'setting') {
        return { schema: op.schema, key: op.key, ...(op.path ? { path: op.path } : {}),
            ...(op.schemaDir ? { schemaDir: op.schemaDir } : {}) };
    }
    if (op.kind === 'ini' || op.kind === 'ini-list')
        return { path: op.path, group: op.group ?? null, key: op.key };
    return { path: op.path };
}

const isFileKind = kind => kind !== 'setting';

const splitList = value => (value ?? '').split(';').filter(Boolean);
const joinList = items => (items.length ? `${items.join(';')};` : null);

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
    if (op.kind === 'ini')
        return { content: setIni(current.content, op.group ?? null, op.key, op.value) };
    if (op.kind === 'ini-list') {
        const have = splitList(getIni(current.content, op.group ?? null, op.key));
        const items = [...have, ...op.items.filter(i => !have.includes(i))];
        return { content: items.length === have.length ? current.content : setIni(current.content, op.group ?? null, op.key, joinList(items)) };
    }
    return { value: op.value, userSet: true };
}

/** What the ledger records as written for an op. */
function writtenOf(op, entry) {
    if (op.kind === 'line')
        return { line: op.line };
    if (op.kind === 'ini')
        return { value: op.value };
    if (op.kind === 'ini-list') {
        const before = splitList(getIni(entry.baseline.content, op.group ?? null, op.key));
        return { added: op.items.filter(i => !before.includes(i)) };
    }
    return null;
}

function validate(op) {
    if (op.kind === 'line' && (typeof op.line !== 'string' || !op.line.includes(LINE_MARKER) || op.line.includes('\n')))
        throw new Error(`a managed line must be one line containing ${LINE_MARKER}`);
    if ((op.kind === 'ini' && typeof op.value !== 'string') || (op.kind === 'ini-list' && !Array.isArray(op.items)))
        throw new Error(`an ${op.kind} op needs ${op.kind === 'ini' ? 'a string value' : 'a list of items'}`);
    if (!['file', 'line', 'ini', 'ini-list', 'setting'].includes(op.kind))
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
    if (entry.kind === 'file' || entry.kind === 'setting')
        return entry.baseline;
    if (current.content === null)
        return { content: null };
    let rest;
    if (entry.kind === 'line') {
        rest = withoutLine(current.content);
    } else if (entry.kind === 'ini') {
        rest = setIni(current.content, entry.ref.group, entry.ref.key, getIni(entry.baseline.content, entry.ref.group, entry.ref.key));
    } else {
        const added = entry.written?.added ?? [];
        const left = splitList(getIni(current.content, entry.ref.group, entry.ref.key)).filter(i => !added.includes(i));
        rest = setIni(current.content, entry.ref.group, entry.ref.key, joinList(left));
    }
    return { content: isEmptyIni(rest) && entry.baseline.content === null ? null : rest };
}

/** Whether someone changed the subject since Chromancy last wrote it. */
function changedSince(entry, current) {
    if (entry.written === null)
        return true;
    if (entry.kind === 'line')
        return !(current.content ?? '').includes(entry.written.line);
    if (entry.kind === 'ini')
        return getIni(current.content, entry.ref.group, entry.ref.key) !== entry.written.value;
    if (entry.kind === 'ini-list') {
        const have = splitList(getIni(current.content, entry.ref.group, entry.ref.key));
        return !entry.written.added.every(i => have.includes(i));
    }
    return !sameState(entry.kind, current, entry.written);
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
        result.overwrote = changedSince(entry, current);
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
        const subject = subjectOf(op.kind, ref);
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
        entry.written = writtenOf(op, entry) ?? want;
        await save();
    }
    if (targets) {
        for (const [subject, entry] of Object.entries(ledger.entries).reverse()) {
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
    for (const [subject, entry] of Object.entries(ledger.entries).reverse()) {
        if (targets && !targets.includes(entry.target))
            continue;
        results.push(await restoreEntry(system, ledger, save, subject, entry));
    }
    return { results };
}
