// The palette editor: start from a palette, change its name and colors, see the preview follow, and
// save it as one of the user's palettes. Terminal colors and fonts are kept from the starting palette.

import Adw from 'gi://Adw?version=1';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';

import { resolvePalette } from '../lib/derive.js';
import { ACCENT_ROLES, BORDER_ROLES, COLOR_ROLES, SEMANTIC_ROLES, parsePalette } from '../lib/palette.js';
import { hexToRgba, rgbaToHex } from './widgets.js';

const TITLES = {
    'primary': 'Accent', 'on-primary': 'Text on accent', 'surface': 'Background', 'surface-container': 'Cards, menus, headers',
    'on-surface': 'Text', 'on-surface-variant': 'Secondary text', 'outline-variant': 'Borders and dividers',
    'hover': 'Hover and selection', 'on-hover': 'Text on hover', 'secondary': 'Second accent', 'on-secondary': 'Text on second accent',
    'tertiary': 'Third accent', 'on-tertiary': 'Text on third accent', 'inactive-border': 'Unfocused window border',
    'destructive': 'Destructive', 'success': 'Success', 'warning': 'Warning', 'error': 'Error',
};
const OPTIONAL = [...ACCENT_ROLES.flatMap(r => [r, `on-${r}`]), ...BORDER_ROLES, ...SEMANTIC_ROLES];

/** A palette id from a name: lowercase letters, digits and dashes. */
export function slug(name) {
    return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'palette';
}

export const PaletteEditor = GObject.registerClass({
    Signals: { 'changed': { param_types: [GObject.TYPE_JSOBJECT] }, 'save': { param_types: [GObject.TYPE_JSOBJECT] } },
}, class PaletteEditor extends Adw.Dialog {
    /** @param {object} base a resolved palette to start from */
    _init(base) {
        super._init({ title: 'Customize Palette', content_width: 520, content_height: 680 });
        this._base = base;
        this._colors = { ...base.colors };
        this._buttons = new Map();

        const view = new Adw.ToolbarView();
        const header = new Adw.HeaderBar({ show_end_title_buttons: false, show_start_title_buttons: false });
        const cancel = new Gtk.Button({ label: 'Cancel' });
        cancel.connect('clicked', () => this.close());
        this._saveButton = new Gtk.Button({ label: 'Save', css_classes: ['suggested-action'] });
        this._saveButton.connect('clicked', () => this._save());
        header.pack_start(cancel);
        header.pack_end(this._saveButton);
        view.add_top_bar(header);

        const page = new Adw.PreferencesPage();
        const nameGroup = new Adw.PreferencesGroup();
        this._name = new Adw.EntryRow({ title: 'Name', text: base.origin === 'user' ? base.name : `${base.name} (custom)` });
        this._name.connect('changed', () => this._update());
        nameGroup.add(this._name);
        page.add(nameGroup);

        this._problems = new Adw.PreferencesGroup({ title: 'Contrast', visible: false });
        this._problemRows = [];
        page.add(this._problems);

        const required = new Adw.PreferencesGroup({ title: 'Colors' });
        for (const role of COLOR_ROLES)
            required.add(this._row(role, false));
        page.add(required);
        const optional = new Adw.PreferencesGroup({ title: 'Optional colors', description: 'Unset ones keep the system’s own or are worked out from the others.' });
        for (const role of OPTIONAL)
            optional.add(this._row(role, true));
        page.add(optional);
        view.set_content(page);
        this.set_child(view);
        this._update();
    }

    _row(role, clearable) {
        const row = new Adw.ActionRow({ title: TITLES[role] ?? role, subtitle: role });
        const button = new Gtk.ColorDialogButton({ dialog: new Gtk.ColorDialog({ with_alpha: false }), valign: Gtk.Align.CENTER });
        if (this._colors[role])
            button.set_rgba(hexToRgba(this._colors[role].slice(0, 7)));
        button.connect('notify::rgba', () => {
            this._colors[role] = rgbaToHex(button.get_rgba());
            this._update();
        });
        row.add_suffix(button);
        if (clearable) {
            const clear = new Gtk.Button({ icon_name: 'edit-clear-symbolic', tooltip_text: 'Unset', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
            clear.connect('clicked', () => {
                delete this._colors[role];
                if (role === 'secondary' || role === 'tertiary')
                    delete this._colors[`on-${role}`];
                this._update();
            });
            row.add_suffix(clear);
        }
        this._buttons.set(role, { row, button });
        return row;
    }

    /** The palette as the editor holds it, as file data. */
    data() {
        const data = { name: this._name.get_text().trim() || 'Custom', variant: this._base.variant, colors: {} };
        for (const role of [...COLOR_ROLES, ...OPTIONAL]) {
            if (this._colors[role] !== undefined)
                data.colors[role] = this._colors[role].slice(0, 7);
        }
        if (this._base.terminal)
            data.terminal = this._base.terminal;
        if (this._base.fonts)
            data.fonts = this._base.fonts;
        return data;
    }

    _update() {
        for (const [role, { row }] of this._buttons)
            row.set_subtitle(this._colors[role] === undefined ? `${role} · not set` : role);
        let resolved = null;
        let error = null;
        try {
            resolved = resolvePalette(parsePalette(slug(this.data().name), this.data()));
        } catch (e) {
            error = e.message;
        }
        for (const r of this._problemRows)
            this._problems.remove(r);
        this._problemRows = (error ? [error] : resolved.warnings).map(w => new Adw.ActionRow({ title: w, css_classes: ['warning'] }));
        this._problemRows.forEach(r => this._problems.add(r));
        this._problems.set_visible(this._problemRows.length > 0);
        this._saveButton.set_sensitive(!error);
        if (resolved)
            this.emit('changed', { ...resolved, origin: 'user' });
    }

    _save() {
        const data = this.data();
        this.emit('save', { id: slug(data.name), data });
    }
});
