// Small building blocks for the window: palette cards, the live preview and the CSS that colors them.

import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';

import { cardCss, previewCss } from '../lib/previewCss.js';

/** A CSS provider for the display whose rules can be replaced. */
export class ScopedCss {
    constructor() {
        this._provider = new Gtk.CssProvider();
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), this._provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    set(css) {
        this._provider.load_from_string(css);
    }

    destroy() {
        Gtk.StyleContext.remove_provider_for_display(Gdk.Display.get_default(), this._provider);
    }
}

/** The CSS for every palette card. */
export function allCardsCss(palettes) {
    return [...palettes.values()].map(cardCss).join('\n');
}

/** A palette card: a swatch drawn in the palette's colors, its name and kind. */
export function paletteCard(palette, { applied = false } = {}) {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, css_classes: [`cp-card-${palette.id}`] });
    box.paletteId = palette.id;
    const swatch = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8, css_classes: ['cp-swatch'],
        height_request: 84 });
    swatch.set_margin_top(0);
    const bar = new Gtk.Box({ css_classes: ['cp-swatch-bar'], height_request: 14, margin_start: 10, margin_end: 34, margin_top: 12 });
    const dots = new Gtk.Box({ spacing: 6, margin_start: 10, margin_bottom: 10, valign: Gtk.Align.END, vexpand: true });
    for (let i = 0; i < 3; i++)
        dots.append(new Gtk.Box({ css_classes: [`cp-dot-${i}`], valign: Gtk.Align.CENTER }));
    swatch.append(bar);
    swatch.append(dots);
    box.append(swatch);
    const title = new Gtk.Label({ label: palette.name, xalign: 0, css_classes: ['heading'], ellipsize: 3 });
    const kind = [palette.variant === 'dark' ? 'Dark' : 'Light', palette.origin === 'user' ? 'yours' : null,
        applied ? 'applied' : null].filter(Boolean).join(' · ');
    box.append(title);
    box.append(new Gtk.Label({ label: kind, xalign: 0, css_classes: ['caption', 'dim-label'] }));
    return box;
}

const label = (text, classes = [], extra = {}) => new Gtk.Label({ label: text, xalign: 0, css_classes: classes, ...extra });

function pill(on) {
    const p = new Gtk.Box({ css_classes: [on ? 'cp-pill-on' : 'cp-pill-off'], valign: Gtk.Align.CENTER, halign: Gtk.Align.END });
    const knob = new Gtk.Box({ css_classes: ['cp-knob'], hexpand: on, halign: on ? Gtk.Align.END : Gtk.Align.START });
    p.append(knob);
    if (!on)
        p.append(new Gtk.Box({ hexpand: true }));
    return p;
}

/** A small mock window drawn in the palette's colors: header, sidebar, a card of rows, buttons. */
export function previewWidget() {
    const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, css_classes: ['chromancy-preview'], overflow: Gtk.Overflow.HIDDEN });
    const header = new Gtk.Box({ css_classes: ['cp-header'], spacing: 8 });
    header.append(label('Preview', ['heading'], { hexpand: true }));
    header.append(new Gtk.Label({ label: 'Apply', css_classes: ['cp-button'] }));
    root.append(header);

    const body = new Gtk.Box({ vexpand: true });
    const side = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, css_classes: ['cp-sidebar'], width_request: 130 });
    side.append(label('Wi-Fi', ['cp-item', 'cp-item-selected']));
    for (const t of ['Displays', 'Sound', 'Appearance'])
        side.append(label(t, ['cp-item']));
    body.append(side);

    const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, hexpand: true,
        margin_start: 16, margin_end: 16, margin_top: 16, margin_bottom: 16 });
    const card = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, css_classes: ['cp-card'] });
    const row = (title, sub, on) => {
        const r = new Gtk.Box({ css_classes: ['cp-row'], spacing: 8 });
        const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
        text.append(label(title));
        if (sub)
            text.append(label(sub, ['cp-dim', 'caption']));
        r.append(text);
        r.append(pill(on));
        return r;
    };
    card.append(row('Wi-Fi', 'Connected', true));
    card.append(row('Airplane Mode', 'Turns off every radio', false));
    card.append(row('Hidden Networks', null, false));
    content.append(card);
    content.append(label('A link in the accent color', ['cp-accent']));
    content.append(label('Secondary text sits a step back.', ['cp-dim']));
    const buttons = new Gtk.Box({ spacing: 8 });
    buttons.append(new Gtk.Label({ label: 'Suggested', css_classes: ['cp-button'] }));
    buttons.append(new Gtk.Label({ label: 'Secondary', css_classes: ['cp-button-secondary'] }));
    buttons.append(new Gtk.Label({ label: 'Error text', css_classes: ['cp-error'], margin_start: 6 }));
    content.append(buttons);
    body.append(content);
    root.append(body);
    return root;
}

/** CSS for the preview of one palette. */
export { previewCss };

/** #rrggbb from a Gdk.RGBA. */
export function rgbaToHex(rgba) {
    return `#${[rgba.red, rgba.green, rgba.blue].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** A Gdk.RGBA from #rrggbb. */
export function hexToRgba(hex) {
    const rgba = new Gdk.RGBA();
    rgba.parse(hex);
    return rgba;
}
