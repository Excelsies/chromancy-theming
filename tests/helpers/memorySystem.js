// In-memory stand-in for app/system.js, with fault injection. The shared applier scenarios run
// against this and against the real backend, so the two must behave the same.

export const TEST_SCHEMA = 'io.github.excelsies.ChromancyTheming.Test';
export const TEST_RELOCATABLE = 'io.github.excelsies.ChromancyTheming.TestRelocatable';
const DEFAULTS = { text: '', list: [], flag: false };
const RELOCATABLE_DEFAULTS = { name: '' };

export function memoryEnv() {
    const files = new Map();
    const settings = new Map();
    const brokenRead = new Set();
    const brokenWrite = new Set();
    const clone = v => JSON.parse(JSON.stringify(v));
    const ioError = (op, path) => Object.assign(new Error(`${op} failed: ${path}`), { code: 'EIO' });
    const keyOf = ref => `${ref.schema}${ref.path ?? ''}/${ref.key}`;
    const defaultOf = ref => {
        const table = ref.schema === TEST_SCHEMA ? DEFAULTS : ref.schema === TEST_RELOCATABLE && ref.path ? RELOCATABLE_DEFAULTS : null;
        if (!table || !(ref.key in table))
            throw new Error(`no such setting: ${keyOf(ref)}`);
        return table[ref.key];
    };

    const system = {
        async readText(path) {
            if (brokenRead.has(path))
                throw ioError('read', path);
            return files.has(path) ? files.get(path) : null;
        },
        async writeText(path, text) {
            if (brokenWrite.has(path))
                throw ioError('write', path);
            files.set(path, text);
        },
        async readBase64(path) {
            return this.readText(path);
        },
        async writeBase64(path, data) {
            return this.writeText(path, data);
        },
        async remove(path) {
            if (brokenWrite.has(path))
                throw ioError('remove', path);
            files.delete(path);
        },
        async readSetting(ref) {
            const fallback = defaultOf(ref);
            const k = keyOf(ref);
            return settings.has(k) ? { value: clone(settings.get(k)), userSet: true } : { value: clone(fallback), userSet: false };
        },
        async writeSetting(ref, value) {
            defaultOf(ref);
            settings.set(keyOf(ref), clone(value));
        },
        async resetSetting(ref) {
            defaultOf(ref);
            settings.delete(keyOf(ref));
        },
    };

    return {
        system,
        ledgerPath: '/state/ledger.json',
        path: name => `/sandbox/${name}`,
        setting: key => ({ schema: TEST_SCHEMA, key }),
        relocatable: path => ({ schema: TEST_RELOCATABLE, path, key: 'name' }),
        async seedFile(path, text) {
            files.set(path, text);
        },
        async seedSetting(ref, value) {
            settings.set(keyOf(ref), clone(value));
        },
        breakRead: path => brokenRead.add(path),
        breakWrite: path => brokenWrite.add(path),
    };
}
