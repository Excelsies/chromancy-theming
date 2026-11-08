// Runs lib/ under GJS, the runtime the app uses: every built-in palette parses and resolves with no
// contrast warnings, and the results match what node computes (pinned values below).
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { parsePalette } from '../../lib/palette.js';
import { resolvePalette } from '../../lib/derive.js';
import { parsePtyxisPalette } from '../../lib/ptyxisPalette.js';
import { contrast, mix } from '../../lib/color.js';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const dataDir = GLib.build_filenamev([here, '..', '..', 'data', 'palettes']);
const read = path => new TextDecoder().decode(GLib.file_get_contents(path)[1]);

let failures = 0;
const check = (ok, what) => {
    if (!ok) {
        failures++;
        printerr(`FAIL: ${what}`);
    }
};

const enumerator = Gio.File.new_for_path(dataDir).enumerate_children('standard::name', 0, null);
let count = 0;
for (let info; (info = enumerator.next_file(null));) {
    const name = info.get_name();
    if (!name.endsWith('.json'))
        continue;
    count++;
    const p = resolvePalette(parsePalette(name.slice(0, -5), JSON.parse(read(GLib.build_filenamev([dataDir, name])))));
    check(p.warnings.length === 0, `${name}: ${p.warnings.join('; ')}`);
}
check(count === 50, `expected 50 built-in palettes, found ${count}`);

check(contrast('#767676', '#ffffff').toFixed(2) === '4.54', 'contrast under GJS');
check(mix('#ff0000', '#0000ff', 0.25) === '#bf0040', 'mix under GJS');
const pt = parsePtyxisPalette(read(GLib.build_filenamev([here, '..', 'fixtures', 'ptyxis', 'Jeweltone.palette'])));
check(pt.dark['cursor-text'] === '#17120a', 'Ptyxis palette under GJS');

if (failures) {
    printerr(`${failures} failure(s)`);
    imports.system.exit(1);
}
print(`ok: lib under GJS, ${count} palettes`);
