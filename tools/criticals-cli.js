// usage: gjs -m tools/criticals-cli.js <shell log> [extra allowed regex]
// Prints the failing criticals (one per line) on stdout and a count of exempt shell-teardown ones on
// stderr. See tools/lib/criticals.js for the rules.
import GLib from 'gi://GLib';
import System from 'system';

import { classifyCriticals } from './lib/criticals.js';

const [path, extraAllowed = ''] = System.programArgs;
const [, bytes] = GLib.file_get_contents(path);
const { failing, teardown } = classifyCriticals(new TextDecoder().decode(bytes), { extraAllowed });
for (const line of failing)
    print(line);
if (teardown.length)
    printerr(`note: ${teardown.length} GNOME Shell teardown critical(s) exempt (all frames in the shell's own code, after the last check)`);
System.exit(0);
