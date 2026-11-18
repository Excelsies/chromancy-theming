// OmniMux reads its colors from ~/.config/omnimux/theme-override.json: Chromancy's color roles under
// their own names, the variant, a display name ("source") and, when the palette has them, the terminal
// colors nested under "terminal". OmniMux only reads the file and checks it about once a second, so a
// running OmniMux follows an Apply, and Restore (which removes the file) gives it back its own theme.
// OmniMux's own "Allow external themes" switch decides whether the file is used; writing it while the
// switch is off is harmless, and turning the switch on then shows the current palette.

import { templateVars } from '../template.js';

/** OmniMux's home, present once it has run. */
const OMNIMUX_HOME = '.omnimux';
const OVERRIDE_FILE = 'omnimux/theme-override.json';
const TERMINAL_KEYS = ['term-background', 'term-foreground', 'term-cursor', 'term-cursor-text'];

/** The file's content for a palette. */
export function overrideJson(palette) {
    const vars = templateVars(palette);
    const isColor = k => !k.endsWith('.hex') && !['name', 'id', 'variant'].includes(k)
        && !TERMINAL_KEYS.includes(k) && !/^ansi\d+$/.test(k);
    const file = { source: `Chromancy Theming: ${palette.name}`, variant: palette.variant };
    for (const [k, v] of Object.entries(vars)) {
        if (isColor(k))
            file[k] = v;
    }
    if (palette.terminal) {
        file.terminal = { background: vars['term-background'], foreground: vars['term-foreground'],
            cursor: vars['term-cursor'], 'cursor-text': vars['term-cursor-text'] };
        for (let i = 0; i < 16; i++)
            file.terminal[`ansi${i}`] = vars[`ansi${i}`];
    }
    return `${JSON.stringify(file, null, 2)}\n`;
}

export const omnimux = {
    id: 'omnimux',
    title: 'OmniMux',
    lock: 'none',
    async inspect(ctx) {
        if (!await ctx.system.exists(`${ctx.home}/${OMNIMUX_HOME}`))
            return { available: false, reason: 'OmniMux is not installed (it has not run for this user)' };
        return { available: true };
    },
    plan(palette, { paths }) {
        return [{ target: 'omnimux', kind: 'file', path: `${paths.config}/${OVERRIDE_FILE}`, content: overrideJson(palette) }];
    },
};
