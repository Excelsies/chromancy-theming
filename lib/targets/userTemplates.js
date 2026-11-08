// The user's own templates (~/.config/chromancy-theming/templates/*.tmpl). Each starts with a line
// "chromancy-output: <path>" (absolute, or ~/ for the home directory, and inside it); the rest is filled
// with the palette (lib/template.js names) and written there.

import { render, templateVars } from '../template.js';

const HEADER = /^chromancy-output:\s*(\S.*?)\s*$/;

/** The output path of a template, resolved against home, or an error message. */
export function outputPath(text, home) {
    const first = text.split('\n', 1)[0];
    const m = HEADER.exec(first);
    if (!m)
        return { error: 'the first line must be "chromancy-output: <path>"' };
    const raw = m[1].startsWith('~/') ? `${home}/${m[1].slice(2)}` : m[1];
    const parts = [];
    for (const part of raw.split('/')) {
        if (part === '..')
            parts.pop();
        else if (part && part !== '.')
            parts.push(part);
    }
    const path = `/${parts.join('/')}`;
    if (!raw.startsWith('/') || !path.startsWith(`${home}/`))
        return { error: `the output must be inside ${home}` };
    return { path };
}

export const userTemplates = {
    id: 'templates',
    title: 'Your templates',
    lock: 'none',
    async inspect(ctx) {
        const templates = await ctx.system.listTemplates(ctx.userTemplates);
        if (!templates.length)
            return { available: false, reason: `no templates in ${ctx.userTemplates}` };
        return { available: true, templates, home: ctx.home };
    },
    plan(palette, { info }) {
        const vars = templateVars(palette);
        const problems = [];
        const ops = [];
        for (const { name, text } of info.templates) {
            const out = outputPath(text, info.home);
            if (out.error) {
                problems.push(`${name}: ${out.error}`);
                continue;
            }
            try {
                ops.push({ target: 'templates', kind: 'file', path: out.path, content: render(text.slice(text.indexOf('\n') + 1), vars) });
            } catch (e) {
                problems.push(`${name}: ${e.message}`);
            }
        }
        if (problems.length)
            throw new Error(problems.join('; '));
        return ops;
    },
};
