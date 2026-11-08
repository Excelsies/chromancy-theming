// The main window: pick a palette (with a live preview), customize it, choose fonts and targets, and
// apply or restore. The work runs through app/runner.js like the command line, so both behave alike.

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';

import { withFonts } from '../lib/config.js';
import { FONT_ROLES } from '../lib/palette.js';
import { TARGETS } from '../lib/targets/index.js';
import { PaletteEditor } from './editor.js';
import { applyPalette, loadConfig, loadPalettes, restoreTargets, saveConfig, savePalette } from './runner.js';
import { ScopedCss, allCardsCss, paletteCard, previewCss, previewWidget } from './widgets.js';

const TARGET_DESCRIPTIONS = {
    style: 'GNOME’s light or dark style, from the palette',
    gtk4: 'Settings, Files and other libadwaita apps',
    gtk3: 'Older GTK apps, through Yaru rebuilt with the palette',
    shell: 'Top bar, menus, quick settings and notifications (needs the Chromancy Theming extension)',
    fonts: 'Interface, document and monospace fonts',
};
const FONT_TITLES = { interface: 'Interface', document: 'Documents', monospace: 'Monospace' };
const SHELL_PATH = '/io/github/excelsies/ChromancyTheming/Shell';

export const ChromancyWindow = GObject.registerClass(class ChromancyWindow extends Adw.ApplicationWindow {
    /** @param {{application: Adw.Application, ctx: object}} params */
    _init({ application, ctx }) {
        super._init({ application, title: 'Chromancy Theming', default_width: 1120, default_height: 760 });
        this.ctx = ctx;
        this.busy = false;
        this._cardsCss = new ScopedCss();
        this._previewCss = new ScopedCss();
        this.connect('destroy', () => {
            this._cardsCss.destroy();
            this._previewCss.destroy();
        });

        this._toasts = new Adw.ToastOverlay();
        const view = new Adw.ToolbarView();
        const header = new Adw.HeaderBar();
        this._stack = new Adw.ViewStack();
        header.set_title_widget(new Adw.ViewSwitcher({ stack: this._stack, policy: Adw.ViewSwitcherPolicy.WIDE }));
        this._restoreButton = new Gtk.Button({ label: 'Restore', tooltip_text: 'Put everything back as it was before Chromancy' });
        this._restoreButton.connect('clicked', () => this._confirmRestore());
        this._applyButton = new Gtk.Button({ label: 'Apply', css_classes: ['suggested-action'] });
        this._applyButton.connect('clicked', () => this.applySelected());
        this._spinner = new Adw.Spinner({ visible: false });
        header.pack_start(this._restoreButton);
        header.pack_end(this._applyButton);
        header.pack_end(this._spinner);
        view.add_top_bar(header);
        this._banner = new Adw.Banner({ revealed: false });
        view.add_top_bar(this._banner);

        this._stack.add_titled_with_icon(this._palettesPage(), 'palettes', 'Palettes', 'applications-graphics-symbolic');
        this._stack.add_titled_with_icon(this._fontsPage(), 'fonts', 'Fonts', 'font-x-generic-symbolic');
        this._stack.add_titled_with_icon(this._targetsPage(), 'targets', 'Apply To', 'emblem-system-symbolic');
        view.set_content(this._stack);
        this._toasts.set_child(view);
        this.set_content(this._toasts);
        this.ready = this._load();
    }

    // ---- Palettes

    _palettesPage() {
        const paned = new Gtk.Box();
        const scroller = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, hexpand: true, width_request: 420 });
        this._flow = new Gtk.FlowBox({ selection_mode: Gtk.SelectionMode.SINGLE, homogeneous: true, min_children_per_line: 2,
            max_children_per_line: 5, column_spacing: 12, row_spacing: 18, valign: Gtk.Align.START,
            margin_start: 18, margin_end: 18, margin_top: 18, margin_bottom: 18 });
        this._flow.connect('selected-children-changed', () => {
            const child = this._flow.get_selected_children()[0];
            if (child)
                this.select(child.get_child().paletteId);
        });
        scroller.set_child(this._flow);
        paned.append(scroller);

        const side = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, width_request: 520,
            margin_start: 6, margin_end: 18, margin_top: 18, margin_bottom: 18 });
        this._selName = new Gtk.Label({ xalign: 0, css_classes: ['title-2'] });
        this._selInfo = new Gtk.Label({ xalign: 0, css_classes: ['dim-label'], wrap: true });
        side.append(this._selName);
        side.append(this._selInfo);
        this._preview = previewWidget();
        this._preview.set_vexpand(true);
        side.append(this._preview);
        const actions = new Gtk.Box({ spacing: 8, halign: Gtk.Align.END });
        const customize = new Gtk.Button({ label: 'Customize…' });
        customize.connect('clicked', () => this.openEditor());
        actions.append(customize);
        side.append(actions);
        paned.append(side);
        return paned;
    }

    _fillPalettes() {
        let child;
        while ((child = this._flow.get_first_child()))
            this._flow.remove(child);
        this._cardsCss.set(allCardsCss(this.palettes));
        for (const p of this.palettes.values())
            this._flow.append(paletteCard(p, { applied: p.id === this.config.applied }));
    }

    /** Selects a palette: card, preview and the saved choice. */
    select(id) {
        const palette = this.palettes.get(id);
        if (!palette)
            return;
        this.selected = palette;
        this._showPreview(palette);
        const index = [...this.palettes.keys()].indexOf(id);
        const child = this._flow.get_child_at_index(index);
        if (child && !child.is_selected())
            this._flow.select_child(child);
        if (this.config.palette !== id) {
            this.config = { ...this.config, palette: id };
            this._saveConfig();
        }
    }

    _showPreview(palette) {
        this._previewCss.set(previewCss(palette));
        this._selName.set_label(palette.name);
        const bits = [palette.variant === 'dark' ? 'Dark' : 'Light', palette.origin === 'user' ? 'your palette' : 'built in'];
        if (palette.id === this.config?.applied)
            bits.push('applied now');
        if (!palette.terminal)
            bits.push('no terminal colors');
        if (palette.warnings?.length)
            bits.push(`contrast: ${palette.warnings.join('; ')}`);
        this._selInfo.set_label(bits.join(' · '));
    }

    openEditor() {
        const editor = new PaletteEditor(this.selected);
        this.editor = editor;
        editor.connect('changed', (_e, palette) => this._showPreview(palette));
        editor.connect('closed', () => {
            this.editor = null;
            if (this.selected)
                this._showPreview(this.selected);
        });
        editor.connect('save', (_e, { id, data }) => this._savePalette(editor, id, data));
        editor.present(this);
        return editor;
    }

    async _savePalette(editor, id, data) {
        const existing = this.palettes.get(id);
        if (existing?.origin === 'user' && existing.id !== this.selected.id && !await this._confirm(
            `Replace “${existing.name}”?`, 'You already have a palette with this name.', 'Replace'))
            return;
        try {
            await savePalette(this.ctx, id, data);
        } catch (e) {
            this.toast(`Could not save the palette: ${e.message}`);
            return;
        }
        editor.close();
        this._reloadPalettes();
        this.select(id);
        this.toast(`Saved “${data.name}”`);
    }

    // ---- Fonts

    _fontsPage() {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Fonts',
            description: 'A font chosen here replaces the palette’s. Unchanged ones stay as they are.' });
        this._fontRows = new Map();
        for (const role of FONT_ROLES) {
            const row = new Adw.ActionRow({ title: FONT_TITLES[role] });
            const button = new Gtk.FontDialogButton({ dialog: new Gtk.FontDialog(), level: Gtk.FontLevel.FONT,
                valign: Gtk.Align.CENTER, use_font: true });
            const clear = new Gtk.Button({ icon_name: 'edit-clear-symbolic', tooltip_text: 'Don’t change this font',
                valign: Gtk.Align.CENTER, css_classes: ['flat'] });
            button.connect('notify::font-desc', () => {
                if (this._settingFonts)
                    return;
                this.setFont(role, button.get_font_desc()?.to_string() ?? null);
            });
            clear.connect('clicked', () => this.setFont(role, null));
            row.add_suffix(button);
            row.add_suffix(clear);
            group.add(row);
            this._fontRows.set(role, { row, button });
        }
        page.add(group);
        return page;
    }

    /** Chooses a font for a role, or none (null). Resolves once the choice is saved. */
    setFont(role, value) {
        const fonts = { ...this.config.fonts };
        if (value)
            fonts[role] = value;
        else
            delete fonts[role];
        this.config = { ...this.config, fonts };
        this._showFonts();
        return this._saveConfig();
    }

    _showFonts() {
        const iface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        const current = { interface: 'font-name', document: 'document-font-name', monospace: 'monospace-font-name' };
        this._settingFonts = true;
        for (const [role, { row, button }] of this._fontRows) {
            const chosen = this.config.fonts[role];
            row.set_subtitle(chosen ? 'Set by Chromancy' : 'Not changed');
            button.set_font_desc(Pango.FontDescription.from_string(chosen ?? iface.get_string(current[role])));
        }
        this._settingFonts = false;
    }

    // ---- Targets

    _targetsPage() {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Apply To', description: 'Turned-off targets are left as they are.' });
        this._targetRows = new Map();
        for (const t of TARGETS) {
            const row = new Adw.SwitchRow({ title: t.title, subtitle: TARGET_DESCRIPTIONS[t.id] ?? '' });
            row.connect('notify::active', () => {
                if (this._settingTargets)
                    return;
                this.setTarget(t.id, row.get_active());
            });
            group.add(row);
            this._targetRows.set(t.id, row);
        }
        page.add(group);
        return page;
    }

    get enabledTargets() {
        return this.config.targets ?? TARGETS.map(t => t.id);
    }

    /** Turns a target on or off. Resolves once the choice is saved. */
    setTarget(id, on) {
        const set = new Set(this.enabledTargets);
        if (on)
            set.add(id);
        else
            set.delete(id);
        this.config = { ...this.config, targets: TARGETS.map(t => t.id).filter(t => set.has(t)) };
        this._showTargets();
        return this._saveConfig();
    }

    _showTargets() {
        this._settingTargets = true;
        for (const [id, row] of this._targetRows)
            row.set_active(this.enabledTargets.includes(id));
        this._settingTargets = false;
        this._applyButton.set_sensitive(!this.busy && this.enabledTargets.length > 0);
    }

    // ---- Loading and saving

    async _load() {
        const { config, warnings } = await loadConfig(this.ctx);
        this.config = config;
        this._reloadPalettes();
        this._showFonts();
        this._showTargets();
        const first = this.palettes.has(config.palette) ? config.palette
            : this.palettes.has(config.applied) ? config.applied : this.palettes.keys().next().value;
        this.select(first);
        for (const w of [...warnings, ...this.paletteErrors.map(e => `${e.file}: ${e.error}`)])
            this.toast(w);
        this._checkExtension();
    }

    _reloadPalettes() {
        const { palettes, errors } = loadPalettes(this.ctx);
        this.palettes = palettes;
        this.paletteErrors = errors;
        this._fillPalettes();
    }

    async _saveConfig() {
        try {
            await saveConfig(this.ctx, this.config);
        } catch (e) {
            this.toast(`Could not save the settings: ${e.message}`);
        }
    }

    _checkExtension() {
        if (!this.enabledTargets.includes('shell')) {
            this._banner.set_revealed(false);
            return;
        }
        Gio.DBus.session.call('org.gnome.Shell', SHELL_PATH, 'org.freedesktop.DBus.Introspectable', 'Introspect', null,
            new GLib.VariantType('(s)'), Gio.DBusCallFlags.NONE, 2000, null, (conn, res) => {
                let running;
                try {
                    running = conn.call_finish(res).deepUnpack()[0].includes('io.github.excelsies.ChromancyTheming.Shell');
                } catch {
                    running = false;
                }
                this.extensionRunning = running;
                this._banner.set_title('The Chromancy Theming shell extension is not running, so the shell keeps its theme. It starts after you log out and back in.');
                this._banner.set_revealed(!running);
            });
    }

    // ---- Apply and restore

    _setBusy(busy) {
        this.busy = busy;
        this._spinner.set_visible(busy);
        this._applyButton.set_sensitive(!busy && this.enabledTargets.length > 0);
        this._restoreButton.set_sensitive(!busy);
    }

    /** Applies the selected palette to the enabled targets. Resolves to the results. */
    async applySelected() {
        if (this.busy || !this.selected)
            return null;
        this._setBusy(true);
        try {
            const palette = this.selected;
            const { results } = await applyPalette(withFonts(palette, this.config.fonts), this.enabledTargets, this.ctx);
            this.config = { ...this.config, applied: palette.id };
            await this._saveConfig();
            this._fillPalettes();
            this.select(palette.id);
            this._report(`Applied “${palette.name}”`, results, true);
            return results;
        } catch (e) {
            this.toast(`Nothing was applied: ${e.message}`);
            return null;
        } finally {
            this._setBusy(false);
        }
    }

    async _confirmRestore() {
        if (await this._confirm('Restore Everything?',
            'Every file and setting Chromancy changed goes back to how it was before.', 'Restore'))
            await this.restoreAll();
    }

    /** Restores every target. Resolves to the results. */
    async restoreAll() {
        if (this.busy)
            return null;
        this._setBusy(true);
        try {
            const { results } = await restoreTargets(undefined, this.ctx);
            this.config = { ...this.config, applied: null };
            await this._saveConfig();
            this._fillPalettes();
            if (this.selected)
                this.select(this.selected.id);
            this._report('Restored', results, false);
            return results;
        } catch (e) {
            this.toast(`Nothing was restored: ${e.message}`);
            return null;
        } finally {
            this._setBusy(false);
        }
    }

    _report(what, results, applied) {
        const bad = results.filter(r => r.status === 'failed' || r.status === 'locked');
        const changed = results.filter(r => r.status === 'applied' || r.status === 'restored').length;
        let title = `${what}: ${changed} changed`;
        if (bad.length)
            title += `, ${bad.length} not done`;
        else if (applied && changed)
            title += '. Restart open apps to see it';
        this.lastResults = results;
        const toast = new Adw.Toast({ title, button_label: 'Details', timeout: bad.length ? 0 : 6 });
        toast.connect('button-clicked', () => this.showResults(results));
        this._toasts.add_toast(toast);
    }

    /** A dialog listing each result. */
    showResults(results) {
        const dialog = new Adw.Dialog({ title: 'Details', content_width: 640, content_height: 520 });
        const view = new Adw.ToolbarView();
        view.add_top_bar(new Adw.HeaderBar());
        const page = new Adw.PreferencesPage();
        const groups = new Map();
        for (const r of results) {
            if (!groups.has(r.target)) {
                const t = TARGETS.find(x => x.id === r.target);
                const g = new Adw.PreferencesGroup({ title: t?.title ?? r.target });
                groups.set(r.target, g);
                page.add(g);
            }
            const subject = r.subject === 'target' ? '' : r.subject.replace(/^file:/, '').replace(/^setting:/, '');
            const row = new Adw.ActionRow({ title: GLib.markup_escape_text(r.error ?? subject ?? '', -1),
                subtitle: r.error ? GLib.markup_escape_text(subject, -1) : (r.overwrote ? 'overwrote a later change' : '') });
            row.add_suffix(new Gtk.Label({ label: r.status, css_classes: r.status === 'failed' || r.status === 'locked' ? ['error'] : ['dim-label'] }));
            groups.get(r.target).add(row);
        }
        view.set_content(page);
        dialog.set_child(view);
        dialog.present(this);
        return dialog;
    }

    // ---- Helpers

    toast(title) {
        this._toasts.add_toast(new Adw.Toast({ title: GLib.markup_escape_text(title, -1), timeout: 8 }));
    }

    _confirm(heading, body, action) {
        return new Promise(resolve => {
            const dialog = new Adw.AlertDialog({ heading, body });
            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('ok', action);
            dialog.set_response_appearance('ok', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.set_default_response('cancel');
            dialog.connect('response', (_d, response) => resolve(response === 'ok'));
            dialog.present(this);
            this.confirmDialog = dialog;
        });
    }
});
