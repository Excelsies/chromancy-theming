// Editing one key of an INI-style file (GLib key files, qt6ct.conf, btop.conf) while every other line
// stays exactly as it was. Group null is the part before the first [group] header.

const HEADER = /^\s*\[([^\]]+)\]\s*$/;
const ENTRY = /^(\s*)([^=#;\s][^=]*?)(\s*=\s*)(.*)$/;

function lines(text) {
    return text ? text.split('\n') : [];
}

/** [start, end) line range of a group's body, or null when the group is absent. */
function groupRange(ls, group) {
    if (group === null) {
        const end = ls.findIndex(l => HEADER.test(l));
        return [0, end < 0 ? ls.length : end];
    }
    const start = ls.findIndex(l => HEADER.exec(l)?.[1] === group);
    if (start < 0)
        return null;
    let end = start + 1;
    while (end < ls.length && !HEADER.test(ls[end]))
        end++;
    return [start + 1, end];
}

function findKey(ls, range, key) {
    for (let i = range[0]; i < range[1]; i++) {
        const m = ENTRY.exec(ls[i]);
        if (m && m[2] === key)
            return { index: i, match: m };
    }
    return null;
}

/** @returns {string | null} the raw value, or null when the key or group is absent */
export function getIni(text, group, key) {
    const ls = lines(text);
    const range = groupRange(ls, group);
    return range ? findKey(ls, range, key)?.match[4] ?? null : null;
}

/** Sets a key (null removes it, and its group when nothing is left in it). */
export function setIni(text, group, key, value) {
    const ls = lines(text ?? '');
    const trailing = ls.length > 0 && ls[ls.length - 1] === '';
    if (trailing)
        ls.pop();
    const range = groupRange(ls, group);
    const found = range ? findKey(ls, range, key) : null;
    if (value === null) {
        if (!found)
            return text ?? '';
        ls.splice(found.index, 1);
        if (group !== null) {
            const r = groupRange(ls, group);
            const body = ls.slice(r[0], r[1]);
            if (body.every(l => l.trim() === '')) {
                const from = r[0] - 1;
                const to = r[1];
                // Take the blank line before the header with it, so no gap is left.
                const start = from > 0 && ls[from - 1].trim() === '' ? from - 1 : from;
                ls.splice(start, to - start);
            }
        }
    } else if (found) {
        const [, indent, name, sep] = found.match;
        ls[found.index] = `${indent}${name}${sep}${value}`;
    } else if (range) {
        let at = range[1];
        while (at > range[0] && ls[at - 1].trim() === '')
            at--;
        ls.splice(at, 0, `${key}=${value}`);
    } else {
        if (ls.length > 0 && ls[ls.length - 1].trim() !== '')
            ls.push('');
        ls.push(`[${group}]`, `${key}=${value}`);
    }
    return ls.length ? `${ls.join('\n')}\n` : '';
}

/** True when the text holds nothing but blank lines. */
export function isEmptyIni(text) {
    return lines(text).every(l => l.trim() === '');
}
