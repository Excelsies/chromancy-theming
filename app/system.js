// The applier's I/O on the real system: text files through Gio, settings through Gio.Settings.
// Writes replace the file atomically (a temporary file renamed over the old one), and go through
// symlinks to the file they point at, so a symlinked config (a dotfiles manager's) stays a link.
// Links are resolved here because GIO, given the link itself, keeps the link but rewrites its
// target in place, which a reader can catch half-written. GIO also writes in place when a file has
// several hard links, to keep them; that case stays non-atomic.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'delete_async');
Gio._promisify(Gio.File.prototype, 'replace_async');
Gio._promisify(Gio.OutputStream.prototype, 'close_async');

const MAX_LINKS = 40;

/** Follows symlinks to the final path; a dangling link resolves to the path it points at. */
function resolveLinks(path) {
    let file = Gio.File.new_for_path(path);
    for (let i = 0; i < MAX_LINKS; i++) {
        let info;
        try {
            info = file.query_info('standard::is-symlink,standard::symlink-target',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return file;
            throw e;
        }
        if (!info.get_is_symlink())
            return file;
        file = file.get_parent().resolve_relative_path(info.get_symlink_target());
    }
    throw new Error(`${path}: more than ${MAX_LINKS} symlinks`);
}

const schemaCache = new Map();

function settingsFor({ schema, schemaDir, path }) {
    const cacheKey = `${schemaDir ?? ''}\n${schema}`;
    let found = schemaCache.get(cacheKey);
    if (!found) {
        const parent = Gio.SettingsSchemaSource.get_default();
        const source = schemaDir ? Gio.SettingsSchemaSource.new_from_directory(schemaDir, parent, false) : parent;
        found = source?.lookup(schema, true) ?? null;
        if (!found)
            throw new Error(`settings schema ${schema} not found${schemaDir ? ` in ${schemaDir}` : ''}`);
        schemaCache.set(cacheKey, found);
    }
    return { settings: new Gio.Settings({ settings_schema: found, ...(path ? { path } : {}) }), schema: found };
}

function checkKey(schema, ref) {
    if (!schema.has_key(ref.key))
        throw new Error(`settings schema ${ref.schema} has no key ${ref.key}`);
}

/** The keys of a schema, or null when it is not installed (in schemaDir, or system-wide). */
export function schemaKeys(schema, schemaDir) {
    try {
        return settingsFor({ schema, schemaDir }).schema.list_keys();
    } catch {
        return null;
    }
}

export const system = {
    schemaKeys: async (schema, schemaDir) => schemaKeys(schema, schemaDir),
    hasProgram: async name => GLib.find_program_in_path(name) !== null,

    /** The *.tmpl files in a directory, as {name, text}; none when it does not exist. */
    async listTemplates(dir) {
        let enumerator;
        try {
            enumerator = Gio.File.new_for_path(dir).enumerate_children('standard::name', 0, null);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return [];
            throw e;
        }
        const out = [];
        for (let info; (info = enumerator.next_file(null));) {
            const name = info.get_name();
            if (name.endsWith('.tmpl'))
                out.push({ name, text: await this.readText(`${dir}/${name}`) });
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
    },

    /** @returns {Promise<string | null>} the file's text, or null when it does not exist */
    async readText(path) {
        try {
            const [bytes] = await Gio.File.new_for_path(path).load_contents_async(null);
            return new TextDecoder().decode(bytes);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return null;
            throw e;
        }
    },

    /** @returns {Promise<string | null>} the file's bytes as base64, or null when it does not exist */
    async readBase64(path) {
        try {
            const [bytes] = await Gio.File.new_for_path(path).load_contents_async(null);
            return GLib.base64_encode(bytes);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return null;
            throw e;
        }
    },

    async writeBase64(path, data) {
        await this._writeBytes(path, GLib.base64_decode(data));
    },

    async writeText(path, text) {
        await this._writeBytes(path, new TextEncoder().encode(text));
    },

    async _writeBytes(path, bytes) {
        const file = resolveLinks(path);
        try {
            file.get_parent().make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                throw e;
        }
        if (bytes.length === 0) {
            // replace_contents_bytes_async never completes for an empty buffer (GIO asserts on it),
            // so an empty file goes through a replace stream closed with nothing written.
            const stream = await file.replace_async(null, false, Gio.FileCreateFlags.NONE, GLib.PRIORITY_DEFAULT, null);
            await stream.close_async(GLib.PRIORITY_DEFAULT, null);
            return;
        }
        await file.replace_contents_bytes_async(new GLib.Bytes(bytes), null, false, Gio.FileCreateFlags.NONE, null);
    },

    async remove(path) {
        try {
            await Gio.File.new_for_path(path).delete_async(GLib.PRIORITY_DEFAULT, null);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                throw e;
        }
    },

    async readSetting(ref) {
        const { settings, schema } = settingsFor(ref);
        checkKey(schema, ref);
        return {
            value: settings.get_value(ref.key).recursiveUnpack(),
            userSet: settings.get_user_value(ref.key) !== null,
        };
    },

    async writeSetting(ref, value) {
        const { settings, schema } = settingsFor(ref);
        checkKey(schema, ref);
        const type = schema.get_key(ref.key).get_value_type().dup_string();
        if (!settings.set_value(ref.key, new GLib.Variant(type, value)))
            throw new Error(`${ref.schema} ${ref.key} is not writable`);
        Gio.Settings.sync();
    },

    async resetSetting(ref) {
        const { settings, schema } = settingsFor(ref);
        checkKey(schema, ref);
        settings.reset(ref.key);
        Gio.Settings.sync();
    },
};
