// Runtime-criticals gate for tools/shell-test.sh: a script whose checks all pass must still fail when
// the shell log holds GLib or GJS criticals. Pure (no Node or GJS APIs), so it is unit-tested under Node
// and run under GJS by tools/criticals-cli.js.
//
// One exemption: GNOME Shell's own UI being updated after it was disposed while the shell shuts down.
// D-Bus proxies created asynchronously at startup (Background Apps, the IBus candidate popup) can finish
// after the shell has begun tearing down, and their callbacks then touch disposed actors. Such a
// critical is exempt only when ALL of these hold; anything else fails, including one with no stack:
//   - it comes after the script's last "# N/N passed" line (the shell is shutting down);
//   - it is a GJS "has been already disposed" critical;
//   - it has a stack trace, and every frame is in GNOME Shell's own code (resource:///org/gnome/shell/).

const CRITICAL = /CRITICAL \*\*|JS ERROR|JS WARNING|Failed to set text .* from markup/;
// Our own "[chromancy-theming]" lines (tests inject failures on purpose and the extension logs them) and
// the harness's own "Script failed" line.
const ALWAYS_ALLOWED = /\[chromancy-theming\]|Script failed|Failed to exit helper: /;
const SUMMARY = /# \d+\/\d+ passed/;
const DISPOSED = /has been already disposed/;
const STACK_HEADER = /^== Stack trace for context /;
const FRAME = /^#\d+\s/;
const SHELL_FRAME = /resource:\/\/\/org\/gnome\/shell\//;

/** The stack frames printed right after line i (GJS prints a header, then "#n ..." lines). */
function stackAfter(lines, i) {
    let j = i + 1;
    if (j >= lines.length || !STACK_HEADER.test(lines[j]))
        return [];
    const frames = [];
    for (j++; j < lines.length && FRAME.test(lines[j]); j++)
        frames.push(lines[j]);
    return frames;
}

/**
 * @param {string} text  the whole shell log
 * @param {{extraAllowed?: string}} opts  extraAllowed: a regular expression of further lines to accept
 * @returns {{failing: string[], teardown: string[]}}
 */
export function classifyCriticals(text, { extraAllowed = '' } = {}) {
    const lines = text.split('\n');
    const extra = extraAllowed ? new RegExp(extraAllowed) : null;
    let summary = -1;
    lines.forEach((l, i) => {
        if (SUMMARY.test(l))
            summary = i;
    });
    const failing = [];
    const teardown = [];
    lines.forEach((line, i) => {
        if (!CRITICAL.test(line) || ALWAYS_ALLOWED.test(line) || extra?.test(line))
            return;
        const frames = stackAfter(lines, i);
        const shellTeardown = summary >= 0 && i > summary && DISPOSED.test(line) &&
            frames.length > 0 && frames.every(f => SHELL_FRAME.test(f));
        (shellTeardown ? teardown : failing).push(line);
    });
    return { failing, teardown };
}
