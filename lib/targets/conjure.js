// Conjure Launcher, through its theming contract (docs/theming.md in Conjure Launcher): honor its
// lock, name Chromancy in theme-override-source before writing tokens, write only the nine color
// tokens (and the font family when a font is chosen). Restore undoes in reverse order, so the tokens
// go back before the source name is cleared, as the contract requires.

import { COLOR_ROLES } from '../palette.js';
import { pangoFamily } from '../fontnames.js';
import { extensionSchema } from './common.js';

const CONJURE_UUID = 'conjure-launcher@excelsies';
const CONJURE_SCHEMA = 'org.gnome.shell.extensions.conjure-launcher';
const SOURCE_NAME = 'Chromancy Theming';

export const conjure = {
    id: 'conjure',
    title: 'Conjure Launcher',
    async inspect(ctx) {
        const found = await extensionSchema(ctx, CONJURE_UUID, CONJURE_SCHEMA);
        if (!found || !COLOR_ROLES.every(r => found.keys.includes(`theme-${r}`)))
            return { available: false, reason: 'Conjure Launcher is not installed' };
        return { available: true, schemaDir: found.schemaDir, hasSource: found.keys.includes('theme-override-source'),
            hasLock: found.keys.includes('theme-overrides-locked') };
    },
    async lock(ctx, info) {
        if (!info.hasLock)
            return false;
        const { value } = await ctx.system.readSetting({ schema: CONJURE_SCHEMA, key: 'theme-overrides-locked', schemaDir: info.schemaDir });
        return value === true;
    },
    plan(palette, { info }) {
        const op = (key, value) => ({ target: 'conjure', kind: 'setting', schema: CONJURE_SCHEMA, schemaDir: info.schemaDir, key, value });
        const ops = [];
        if (info.hasSource)
            ops.push(op('theme-override-source', SOURCE_NAME));
        for (const role of COLOR_ROLES)
            ops.push(op(`theme-${role}`, palette.colors[role].slice(0, 7)));
        if (palette.fonts?.interface)
            ops.push(op('theme-font-family', pangoFamily(palette.fonts.interface)));
        return ops;
    },
};
