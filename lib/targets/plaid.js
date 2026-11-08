// Plaid's window borders: the active border runs from the accent to the second accent (when Plaid
// draws gradients), unfocused windows use the palette's inactive border, scratchpad windows the third
// accent. Gradient on/off and direction stay the user's choice.

import { extensionSchema } from './common.js';

const PLAID_UUID = 'plaid@plyply99';
const PLAID_SCHEMA = 'org.gnome.shell.extensions.plaid';

export const plaid = {
    id: 'plaid',
    title: 'Plaid window borders',
    lock: 'none',
    async inspect(ctx) {
        const found = await extensionSchema(ctx, PLAID_UUID, PLAID_SCHEMA);
        if (!found || !found.keys.includes('active-border-color') || !found.keys.includes('inactive-border-color'))
            return { available: false, reason: 'Plaid is not installed' };
        return { available: true, schemaDir: found.schemaDir, keys: found.keys };
    },
    plan(palette, { info }) {
        const c = palette.colors;
        const inactive = c['inactive-border'] ?? c['outline-variant'];
        const wanted = {
            'active-border-color': c.primary,
            'active-border-color-2': c.secondary ?? c.primary,
            'inactive-border-color': inactive,
            'inactive-border-color-2': inactive,
            'scratchpad-border-color': c.tertiary ?? c.secondary ?? c.primary,
        };
        return Object.entries(wanted).filter(([key]) => info.keys.includes(key)).map(([key, color]) => ({
            target: 'plaid', kind: 'setting', schema: PLAID_SCHEMA, schemaDir: info.schemaDir, key, value: [color.slice(0, 7)],
        }));
    },
};
