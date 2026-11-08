// The ledger: for every file and setting Chromancy has touched, what it was before the first
// change (the baseline) and what Chromancy last wrote. Restore works from it, so a ledger that
// cannot be read is never treated as empty.
//
//   { "version": 1, "entries": { "<subject>": { target, kind, ref, baseline, written } } }
//
// subject: "file:<path>" or "setting:<schema>/<key>"
// file:    ref {path}, baseline/written {content: string | null}   (null: the file is absent)
// line:    ref {path}, baseline {content}, written {line}          (one managed line of a shared file)
// setting: ref {schema, key, schemaDir?}, baseline/written {value, userSet}

export const LEDGER_VERSION = 1;

export class LedgerError extends Error {
    constructor(message, options) {
        super(`ledger: ${message}`, options);
        this.name = 'LedgerError';
    }
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {string | null} text the ledger file's contents; null when the file does not exist
 * @throws {LedgerError} when the text is not a ledger this version can read
 */
export function parseLedger(text) {
    if (text === null)
        return { version: LEDGER_VERSION, entries: {} };
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new LedgerError(`not valid JSON (${e.message})`, { cause: e });
    }
    if (!isObject(data) || !isObject(data.entries))
        throw new LedgerError('expected {version, entries}');
    if (data.version !== LEDGER_VERSION)
        throw new LedgerError(`version ${JSON.stringify(data.version)} is not ${LEDGER_VERSION}`);
    return data;
}

export function serializeLedger(ledger) {
    return `${JSON.stringify(ledger, null, 2)}\n`;
}

/** @returns {string} the ledger key for an op or a ref */
export function subjectOf(kind, ref) {
    return kind === 'file' ? `file:${ref.path}` : `setting:${ref.schema}/${ref.key}`;
}

/** Whether two recorded states are the same. A setting without a user value matches only another without one. */
export function sameState(kind, a, b) {
    if (kind === 'file' || kind === 'line')
        return a.content === b.content;
    if (a.userSet !== b.userSet)
        return false;
    return !a.userSet || JSON.stringify(a.value) === JSON.stringify(b.value);
}
