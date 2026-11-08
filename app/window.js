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
import { applyBlacklist, applyPalette, deletePalette, loadConfig, loadPalettes, restoreTargets, saveConfig, savePalette } from './runner.js';
import { previewCss } from '../lib/previewCss.js';
import { ScopedCss, allCardsCss, paletteCard, previewWidget } from './widgets.js';

const TARGET_DESCRIPTIONS = {
    style: 'GNOME’s light or dark style, from the palette',
    gtk4: 'Settings, Files and other libadwaita apps',
    gtk3: 'Older GTK apps, through Yaru rebuilt with the palette',
    shell: 'Top bar, menus, quick settings and notifications (needs the Chromancy Theming extension)',
    fonts: 'Interface, document and monospace fonts',
    flatpak: 'Lets Flatpak apps read the GTK stylesheets (from their next start)',
    qt: 'Qt apps, through qt6ct (from the next login)',
    ptyxis: 'A Chromancy palette in Ptyxis\u2019s default profile (needs terminal colors)',
    btop: 'A Chromancy theme for btop (needs terminal colors)',
    'text-editor': 'A style scheme for Text Editor\u2019s writing area (needs terminal colors)',
    templates: 'Your templates in ~/.config/chromancy-theming/templates',
    blacklist: 'Keeps the apps on the Blacklist page out of the theme',
};
const SHELL_INTERFACE = 'io.github.excelsies.ChromancyTheming.Shell';
/** Targets shown as one switch. */
const TARGET_GROUPS = [
    { ids: ['conjure', 'plaid'], title: 'Shell extensions',
        subtitle: 'Extensions that take their colors from Chromancy, such as launchers and window borders' },
];
const groupOf = id => TARGET_GROUPS.find(g => g.ids.includes(id));
/** The title a target is shown under. */
const targetTitle = id => groupOf(id)?.title ?? TARGETS.find(t => t.id === id)?.title ?? id;
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
        this._stack.add_titled_with_icon(this._blacklistPage(), 'blacklist', 'Blacklist', 'action-unavailable-symbolic');
        view.set_content(this._stack);
        this._toasts.set_child(view);
        this.set_content(this._toasts);
        this.ready = this._load();
    }

    // ---- Palettes

    _palettesPage() {
        const paned = new Gtk.Box();
        const left = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true, width_request: 420 });
        this._variantStack = new Adw.ViewStack({ vexpand: true });
        left.append(new Adw.InlineViewSwitcher({ stack: this._variantStack, halign: Gtk.Align.CENTER, margin_top: 12 }));
        left.append(this._variantStack);
        this._sections = {};
        for (const [variant, title] of [['dark', 'Dark'], ['light', 'Light']]) {
            const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8, valign: Gtk.Align.START,
                margin_start: 18, margin_end: 18, margin_top: 12, margin_bottom: 18 });
            const mineBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 });
            const mine = this._flowBox();
            mineBox.append(new Gtk.Label({ label: 'Yours', xalign: 0, css_classes: ['heading'] }));
            mineBox.append(mine);
            mineBox.append(new Gtk.Separator({ margin_top: 10, margin_bottom: 6 }));
            const builtIn = this._flowBox();
            box.append(mineBox);
            box.append(new Gtk.Label({ label: 'Built In', xalign: 0, css_classes: ['heading'] }));
            box.append(builtIn);
            this._variantStack.add_titled(new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, child: box }), variant, title);
            this._sections[variant] = { mine, builtIn, mineBox };
        }
        paned.append(left);

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
        this._deleteButton = new Gtk.Button({ label: 'Delete', css_classes: ['destructive-action'], visible: false });
        this._deleteButton.connect('clicked', () => this.confirmDeletePalette(this.selected.id));
        const customize = new Gtk.Button({ label: 'Customize\u2026' });
        customize.connect('clicked', () => this.openEditor());
        actions.append(this._deleteButton);
        actions.append(customize);
        side.append(actions);
        paned.append(side);
        return paned;
    }

    _flowBox() {
        const flow = new Gtk.FlowBox({ selection_mode: Gtk.SelectionMode.SINGLE, homogeneous: true, min_children_per_line: 2,
            max_children_per_line: 5, column_spacing: 12, row_spacing: 18, valign: Gtk.Align.START });
        flow.connect('selected-children-changed', () => {
            const child = flow.get_selected_children()[0];
            if (child && !this._selecting)
                this.select(child.get_child().paletteId);
        });
        return flow;
    }

    get _flowBoxes() {
        return Object.values(this._sections).flatMap(s => [s.mine, s.builtIn]);
    }

    _fillPalettes() {
        for (const flow of this._flowBoxes) {
            let child;
            while ((child = flow.get_first_child()))
                flow.remove(child);
        }
        this._cardsCss.set(allCardsCss(this.palettes));
        for (const p of this.palettes.values()) {
            const section = this._sections[p.variant];
            const mine = p.origin === 'user';
            (mine ? section.mine : section.builtIn).append(paletteCard(p, { applied: p.id === this.config.applied,
                onDelete: mine ? id => this.confirmDeletePalette(id) : null }));
        }
        for (const s of Object.values(this._sections))
            s.mineBox.set_visible(s.mine.get_first_child() !== null);
    }

    /** The card's FlowBox child for a palette, and its FlowBox. */
    _cardOf(id) {
        for (const flow of this._flowBoxes) {
            for (let child = flow.get_first_child(); child; child = child.get_next_sibling()) {
                if (child.get_child()?.paletteId === id)
                    return { flow, child };
            }
        }
        return null;
    }

    /** Selects a palette: its tab, its card, the preview and the saved choice. */
    select(id) {
        const palette = this.palettes.get(id);
        if (!palette)
            return;
        this.selected = palette;
        this._showPreview(palette);
        this._deleteButton.set_visible(palette.origin === 'user');
        this._selecting = true;
        this._variantStack.set_visible_child_name(palette.variant);
        const card = this._cardOf(id);
        for (const flow of this._flowBoxes) {
            if (flow !== card?.flow)
                flow.unselect_all();
        }
        if (card && !card.child.is_selected())
            card.flow.select_child(card.child);
        this._selecting = false;
        if (this.config.palette !== id) {
            this.config = { ...this.config, palette: id };
            this._saveConfig();
        }
    }

    /** Asks, then deletes one of the user's palettes. Resolves to true when it was deleted. */
    async confirmDeletePalette(id) {
        const palette = this.palettes.get(id);
        if (palette?.origin !== 'user')
            return false;
        if (!await this._confirm(`Delete \u201c${palette.name}\u201d?`,
            'Its file is removed. Apps keep their current colors until you apply another palette.', 'Delete'))
            return false;
        return this.deletePalette(id);
    }

    /** Deletes one of the user's palettes without asking. Resolves to true when it was deleted. */
    async deletePalette(id) {
        const palette = this.palettes.get(id);
        try {
            await deletePalette(this.ctx, id);
        } catch (e) {
            this.toast(`Could not delete the palette: ${e.message}`);
            return false;
        }
        this._reloadPalettes();
        const next = this.palettes.get(id) ?? this.palettes.get(this.config.applied)
            ?? [...this.palettes.values()].find(p => p.variant === palette.variant);
        this.select(next.id);
        this.toast(`Deleted \u201c${palette.name}\u201d`);
        return true;
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
        this._targetRows = [];
        const shown = new Set();
        for (const t of TARGETS) {
            if (shown.has(t.id))
                continue;
            const g = groupOf(t.id);
            const ids = g ? g.ids : [t.id];
            ids.forEach(id => shown.add(id));
            const row = new Adw.SwitchRow({ title: g ? g.title : t.title, subtitle: g ? g.subtitle : TARGET_DESCRIPTIONS[t.id] ?? '' });
            row.connect('notify::active', () => {
                if (!this._settingTargets)
                    this.setTargets(ids, row.get_active());
            });
            group.add(row);
            this._targetRows.push({ ids, row });
        }
        page.add(group);
        return page;
    }

    get enabledTargets() {
        return this.config.targets ?? TARGETS.map(t => t.id);
    }

    /** Turns a target on or off. Resolves once the choice is saved. */
    setTarget(id, on) {
        return this.setTargets([id], on);
    }

    /** Turns targets on or off together. Resolves once the choice is saved. */
    setTargets(ids, on) {
        const set = new Set(this.enabledTargets);
        for (const id of ids) {
            if (on)
                set.add(id);
            else
                set.delete(id);
        }
        this.config = { ...this.config, targets: TARGETS.map(t => t.id).filter(t => set.has(t)) };
        this._showTargets();
        return this._saveConfig();
    }

    _showTargets() {
        this._settingTargets = true;
        for (const { ids, row } of this._targetRows)
            row.set_active(ids.some(id => this.enabledTargets.includes(id)));
        this._settingTargets = false;
        this._applyButton.set_sensitive(!this.busy && this.enabledTargets.length > 0);
    }

    // ---- Blacklist

    _blacklistPage() {
        const page = new Adw.PreferencesPage();
        this._blacklistGroup = new Adw.PreferencesGroup({ title: 'Apps Kept Out of the Theme',
            description: 'These apps keep their own colors. A change takes effect the next time the app starts.' });
        const buttons = new Gtk.Box({ spacing: 6 });
        const add = new Gtk.Button({ label: 'Add App\u2026', css_classes: ['flat'] });
        add.connect('clicked', () => this.openAppChooser());
        this._pickButton = new Gtk.Button({ label: 'Pick a Window', css_classes: ['flat'] });
        this._pickButton.connect('clicked', () => this.pickWindow());
        buttons.append(add);
        buttons.append(this._pickButton);
        this._blacklistGroup.set_header_suffix(buttons);
        this._blacklistRows = [];
        page.add(this._blacklistGroup);
        return page;
    }

    _showBlacklist() {
        for (const row of this._blacklistRows)
            this._blacklistGroup.remove(row);
        this._blacklistRows = this.config.blacklist.map(id => {
            const info = Gio.DesktopAppInfo.new(id);
            const row = new Adw.ActionRow({ title: GLib.markup_escape_text(info?.get_display_name() ?? id, -1),
                subtitle: info ? id : `${id} (not installed)` });
            const icon = info?.get_icon();
            row.add_prefix(icon ? new Gtk.Image({ gicon: icon, pixel_size: 32 }) : new Gtk.Image({ icon_name: 'application-x-executable-symbolic', pixel_size: 32 }));
            const remove = new Gtk.Button({ icon_name: 'list-remove-symbolic', tooltip_text: 'Theme this app again',
                valign: Gtk.Align.CENTER, css_classes: ['flat'] });
            remove.connect('clicked', () => this.removeFromBlacklist(id));
            row.add_suffix(remove);
            this._blacklistGroup.add(row);
            return row;
        });
        if (this._blacklistRows.length === 0) {
            const empty = new Adw.ActionRow({ title: 'No apps', subtitle: 'Every app follows the theme.' });
            this._blacklistGroup.add(empty);
            this._blacklistRows.push(empty);
        }
        this._pickButton.set_sensitive(this.extensionRunning === true);
        this._pickButton.set_tooltip_text(this.extensionRunning ? 'Click a window of the app'
            : 'Needs the Chromancy Theming shell extension, which starts after you log out and back in');
    }

    /** Asks, then keeps an app out of the theme. Resolves to the results, or null when declined. */
    async confirmBlacklist(id) {
        const info = Gio.DesktopAppInfo.new(id);
        const name = info?.get_display_name() ?? id;
        if (this.config.blacklist.includes(id)) {
            this.toast(`${name} is already on the blacklist`);
            return null;
        }
        if (!await this._confirm(`Stop Theming \u201c${name}\u201d?`,
            `${name} will keep its own colors from the next time it starts.`, 'Stop Theming'))
            return null;
        return this.addToBlacklist(id);
    }

    addToBlacklist(id) {
        return this._changeBlacklist([...new Set([...this.config.blacklist, id])], id, true);
    }

    removeFromBlacklist(id) {
        return this._changeBlacklist(this.config.blacklist.filter(x => x !== id), id, false);
    }

    async _changeBlacklist(list, id, added) {
        if (this.busy)
            return null;
        this._setBusy(true);
        try {
            this.config = { ...this.config, blacklist: list };
            await this._saveConfig();
            this._showBlacklist();
            const { results } = await applyBlacklist(this.config, this.ctx);
            const name = Gio.DesktopAppInfo.new(id)?.get_display_name() ?? id;
            this._report(added ? `${name} keeps its own colors` : `${name} follows the theme again`, results, false);
            return results;
        } catch (e) {
            this.toast(`The blacklist was not applied: ${e.message}`);
            return null;
        } finally {
            this._setBusy(false);
        }
    }

    /** A searchable list of installed apps; choosing one asks, then blacklists it. */
    openAppChooser() {
        const dialog = new Adw.Dialog({ title: 'Add App', content_width: 420, content_height: 560 });
        const view = new Adw.ToolbarView();
        view.add_top_bar(new Adw.HeaderBar());
        const search = new Gtk.SearchEntry({ placeholder_text: 'Search apps', margin_start: 12, margin_end: 12, margin_top: 6, margin_bottom: 6 });
        view.add_top_bar(search);
        const list = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'],
            margin_start: 12, margin_end: 12, margin_bottom: 12, valign: Gtk.Align.START });
        const apps = Gio.AppInfo.get_all().filter(a => a.should_show() && a.get_id())
            .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));
        for (const app of apps) {
            const row = new Adw.ActionRow({ title: GLib.markup_escape_text(app.get_display_name(), -1), activatable: true });
            row.add_prefix(new Gtk.Image({ gicon: app.get_icon() ?? Gio.ThemedIcon.new('application-x-executable'), pixel_size: 32 }));
            row.appId = app.get_id();
            row.appName = app.get_display_name().toLowerCase();
            row.connect('activated', () => {
                dialog.close();
                this.confirmBlacklist(row.appId);
            });
            list.append(row);
        }
        search.connect('search-changed', () => {
            const q = search.get_text().toLowerCase();
            for (let r = list.get_first_child(); r; r = r.get_next_sibling())
                r.set_visible(!q || r.appName.includes(q) || r.appId.toLowerCase().includes(q));
        });
        const scroller = new Gtk.ScrolledWindow({ child: list, vexpand: true });
        view.set_content(scroller);
        dialog.set_child(view);
        dialog.present(this);
        this.appChooser = dialog;
        return dialog;
    }

    /** Asks the shell extension to let the user click a window, then offers to blacklist its app. */
    pickWindow() {
        return new Promise(resolve => {
            Gio.DBus.session.call('org.gnome.Shell', SHELL_PATH, SHELL_INTERFACE, 'PickWindow', null,
                new GLib.VariantType('(ss)'), Gio.DBusCallFlags.NONE, 35000, null, (conn, res) => {
                    let id;
                    try {
                        [id] = conn.call_finish(res).deepUnpack();
                    } catch (e) {
                        const remote = Gio.DBusError.get_remote_error(e) ?? '';
                        if (!remote.endsWith('.Cancelled'))
                            this.toast(remote.endsWith('.NoApp') ? 'That window does not belong to an installed app'
                                : remote.endsWith('.Timeout') ? 'No window was picked' : `Picking failed: ${e.message}`);
                        resolve(null);
                        return;
                    }
                    resolve(this.confirmBlacklist(id));
                });
        });
    }

    // ---- Loading and saving

    async _load() {
        const { config, warnings } = await loadConfig(this.ctx);
        this.config = config;
        this._reloadPalettes();
        this._showFonts();
        this._showTargets();
        this._showBlacklist();
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

    /**
     * Saves the settings. Saves run one after another, each writing the settings as they are when its
     * turn comes: two writes started together could otherwise finish in either order, and an older one
     * finishing last would undo a newer change.
     */
    _saveConfig() {
        this._saving = (this._saving ?? Promise.resolve()).then(async () => {
            try {
                await saveConfig(this.ctx, this.config);
            } catch (e) {
                this.toast(`Could not save the settings: ${e.message}`);
            }
        });
        return this._saving;
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
                this._showBlacklist();
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
            const { results } = await applyPalette(withFonts(palette, this.config.fonts), this.enabledTargets,
                { ...this.ctx, blacklist: this.config.blacklist });
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
            const title = targetTitle(r.target);
            if (!groups.has(title)) {
                const g = new Adw.PreferencesGroup({ title });
                groups.set(title, g);
                page.add(g);
            }
            const subject = r.subject === 'target' ? '' : r.subject.replace(/^file:/, '').replace(/^setting:/, '');
            const row = new Adw.ActionRow({ title: GLib.markup_escape_text(r.error ?? subject ?? '', -1),
                subtitle: r.error ? GLib.markup_escape_text(subject, -1) : (r.overwrote ? 'overwrote a later change' : '') });
            row.add_suffix(new Gtk.Label({ label: r.status, css_classes: r.status === 'failed' || r.status === 'locked' ? ['error'] : ['dim-label'] }));
            groups.get(title).add(row);
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
