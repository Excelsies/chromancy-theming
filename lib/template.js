// Fills {{name}} placeholders in a template with a palette's values. An unknown placeholder is an
// error naming it, so a typo or a palette without terminal colors is reported, not written half-filled.
//
// Names: every color role ({{primary}}, {{on-surface}}...), each also as {{role.hex}} without "#";
// optional roles fall back (secondary and tertiary to the accent before them, inactive-border to
// outline-variant, the semantic colors to defaults derived from the terminal or a fixed red/green/
// yellow); with terminal colors, {{term-background}}, {{term-foreground}}, {{term-cursor}},
// {{term-cursor-text}} and {{ansi0}}..{{ansi15}}; and {{name}}, {{id}}, {{variant}}.

import { COLOR_ROLES } from './palette.js';
import { textOn } from './color.js';

export class TemplateError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TemplateError';
    }
}

export function templateVars(palette) {
    const c = palette.colors;
    const t = palette.terminal;
    const colors = {};
    for (const role of COLOR_ROLES)
        colors[role] = c[role];
    colors.secondary = c.secondary ?? c.primary;
    colors['on-secondary'] = c['on-secondary'] ?? (c.secondary ? textOn(c.secondary, [c['on-surface'], c.surface]) : c['on-primary']);
    colors.tertiary = c.tertiary ?? colors.secondary;
    colors['on-tertiary'] = c['on-tertiary'] ?? (c.tertiary ? textOn(c.tertiary, [c['on-surface'], c.surface]) : colors['on-secondary']);
    colors['inactive-border'] = c['inactive-border'] ?? c['outline-variant'];
    colors.error = c.error ?? c.destructive ?? t?.ansi[1] ?? '#c01c28';
    colors.destructive = c.destructive ?? colors.error;
    colors.success = c.success ?? t?.ansi[2] ?? '#26a269';
    colors.warning = c.warning ?? t?.ansi[3] ?? '#cd9309';
    if (t) {
        colors['term-background'] = t.background;
        colors['term-foreground'] = t.foreground;
        colors['term-cursor'] = t.cursor ?? t.foreground;
        colors['term-cursor-text'] = t['cursor-text'] ?? t.background;
        t.ansi.forEach((a, i) => {
            colors[`ansi${i}`] = a;
        });
    }
    const vars = { name: palette.name, id: palette.id, variant: palette.variant };
    for (const [k, v] of Object.entries(colors)) {
        const hex = v.slice(0, 7);
        vars[k] = hex;
        vars[`${k}.hex`] = hex.slice(1);
    }
    return vars;
}

export function render(template, vars) {
    const missing = new Set();
    const out = template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, name) => {
        if (vars[name] === undefined) {
            missing.add(name);
            return '';
        }
        return vars[name];
    });
    if (missing.size)
        throw new TemplateError(`unknown placeholder${missing.size > 1 ? 's' : ''} ${[...missing].join(', ')}`);
    return out;
}
