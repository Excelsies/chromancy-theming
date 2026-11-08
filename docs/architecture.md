# How Chromancy Theming works

Chromancy Theming turns one palette into the files and settings each part of the desktop reads, writes
them through a ledger that remembers how everything was before, and can put all of it back. This page
follows a palette from its file to the screen.

```
data/palettes/*.json ─┐                                   ┌─ ~/.config/gtk-4.0/   (libadwaita, GTK 4)
~/.config/chromancy-  ├─ parse ─ resolve ─ targets ─ ops ─┼─ ~/.config/gtk-3.0/   (Yaru rebuilt, GTK 3)
  theming/palettes/  ─┘  (palette.js) (derive.js)  plan()  ├─ ~/.local/share/chromancy-theming/shell/
                                                    │      │     └─ loaded by the shell extension
                                       app/yaruBuild.js    ├─ GSettings (style, fonts, Ptyxis, ...)
                                         (sassc, rsvg)     └─ INI keys, overrides, app config files
                                                    │
                                     lib/applier.js + lib/ledger.js  (baseline first, then write)
```

## Layout

| Path | What it holds |
|---|---|
| `lib/` | Everything that decides what to write. No I/O: it runs under both Node (unit tests) and GJS. |
| `lib/targets/` | One module per target; each turns a resolved palette into a list of operations. |
| `app/` | The GJS side: real I/O (`system.js`), the Yaru build, the runner, the command line and the window. |
| `extension/` | The GNOME Shell extension: loads the shell stylesheet and picks windows. |
| `bin/` | `chromancy-theming` (window or command line) and `chromancy-theming-unthemed` (the blacklist wrapper). |
| `data/` | The built-in palettes and the templates for Ptyxis, btop and Text Editor. |
| `vendor/yaru/` | The parts of Yaru's source that Chromancy rebuilds, at the version Ubuntu installs. |
| `tools/` | Test harnesses, preview and screenshot tools, the installer and the Yaru updater. |

## Palettes

A palette is a JSON file (`lib/palette.js` parses and validates it):

```json
{
  "name": "Nord",
  "variant": "dark",
  "colors": { "primary": "#8fbcbb", "surface": "#2e3440", "on-surface": "#eceff4", "...": "..." },
  "terminal": { "background": "#2e3440", "foreground": "#d8dee9", "cursor": "#d8dee9", "ansi": ["16 colors"] },
  "fonts": { "interface": "Ubuntu 11", "document": "Ubuntu 11", "monospace": "Ubuntu Mono 13" }
}
```

Colors are `#rgb`, `#rrggbb` or `#rrggbbaa`. Unknown keys are refused, so a typo is reported rather than
ignored, and every error names its key. `variant` is optional; without it, the palette is dark when its
surface is darker than its text.

| Roles | Meaning | When left out |
|---|---|---|
| `primary`, `surface`, `on-surface` | Accent, background, text | Required |
| `on-primary` | Text on the accent | The palette's text or background, whichever reads better; black or white if neither reaches 4.5:1 |
| `surface-container` | Header bars, sidebars, cards, popovers | 7% from surface toward text |
| `hover` / `on-hover` | Hovered and toggled items, and their text | 12% toward text / chosen like `on-primary` |
| `outline-variant` | Borders and separators | 16% toward text |
| `on-surface-variant` | Secondary text | The first step from 55% toward text that reaches 3:1 |
| `secondary`, `tertiary` (+ `on-…`) | Extra accents | Plaid and templates use the accent before them |
| `inactive-border` | Unfocused window borders | Never derived; Plaid uses `outline-variant` |
| `destructive`, `success`, `warning`, `error` | Semantic colors | The system's own values stay |

`lib/derive.js` fills in the missing roles and checks contrast: text on the accent, surface, hover and
surface-container must reach 4.5:1, secondary text 3:1, and each extra accent 4.5:1 with its text color.
A miss is a warning shown in the window, not an error. The built-in palettes give every UI role
explicitly and meet every floor; `tests/builtins.test.js` holds them to that.

The user's palettes in `~/.config/chromancy-theming/palettes/` load after the built-ins, so one with a
built-in's id replaces it. A file that does not parse is listed with its error instead of being dropped
silently.

## Targets

A target (`lib/targets/*.js`) is an object with:

- `id` and `title`;
- `inspect(ctx)`, optional: whether its app is installed, and facts the plan needs (Ptyxis's default
  profile, the templates on disk);
- `lock`: `'none'`, or a reader of the app's own "keep my theme" switch;
- `build`, optional: `'gtk3'` or `'shell'`, a Yaru build to run first;
- `plan(palette, ctx, built)`: the list of operations. It never writes anything itself, which is what lets
  every target run under Node in the unit tests.

`plan` may throw `TargetSkipped` when there is nothing to apply for this palette (no terminal colors for
Ptyxis); what the target wrote before is then restored.

### GTK 4 and libadwaita

`gtk4` writes `~/.config/gtk-4.0/chromancy-theming.css`, which sets libadwaita's CSS variables (the accent,
the window, view, header bar, sidebar, card, dialog and popover colors, borders and the semantic colors)
plus the matching `@define-color` names for older stylesheets. One line in the user's `gtk.css` imports
it:

```css
@import url("file:///home/me/.config/gtk-4.0/chromancy-theming.css"); /* chromancy-theming */
```

The URL is absolute and percent-encoded, because Snap apps reach `gtk.css` through a symlink and a
relative URL would resolve inside the Snap. The accent is set directly, so any color works; GNOME's own
accent-color setting is never changed. libadwaita draws separators with dark translucent shades that
vanish on very dark surfaces, so those shades use the outline color instead.

### GTK 3 and GNOME Shell: rebuilding Yaru

Ubuntu's GTK 3 and shell themes are Yaru, compiled from SCSS. Chromancy rebuilds them from the source in
`vendor/yaru/` with the palette's colors, so every widget keeps Yaru's shapes and follows the palette.

`app/yaruBuild.js` copies the source to a temporary directory, applies the text transforms in
`lib/yaru.js` and runs `sassc`:

1. **Defaults.** Yaru assigns its base variables without `!default`, so a value set before the import
   would be overwritten. `markDefaults` adds `!default` to every definition of the variables Chromancy
   sets; the generated entry file defines them first. Everything Yaru derives from them follows.
2. **Variables.** GTK 3 gets the background, text, base, header bar, menu and semantic colors; for dark
   palettes, unfocused-window text uses Yaru's formula on the palette's text. The shell gets the same,
   plus the panel, dock and overview, which Yaru keeps dark in both variants: they take the palette's
   darker color with its lighter one as text.
3. **Patches.** Yaru's `optimize-contrast()` raises an error when the contrast it wants is out of reach in
   the one direction it searches; the patch tries the other direction. Yaru writes white text on
   suggested and destructive buttons, which suits only its own accents; the patch routes it through a
   `chromancy-text-on()` function that picks the better-reading text. In the compiled shell CSS,
   `-st-accent-color` is replaced with the palette's accent.

Built with Yaru's own values (`palette: null`), the output is byte-for-byte the installed Yaru theme.
`tests/gjs/yaru.gjs.js` checks this, which proves the pipeline changes nothing but the colors.

GTK 3 also draws twelve images with the accent: the active slider marks and text selection handles.
They are recolored the way Yaru's own build does it. Theme colors in `assets.svg` become placeholder
colors, the placeholders become the palette's colors, and `rsvg-convert` renders each image at the
installed size into `~/.local/share/chromancy-theming/gtk-3.0/assets/`. Every other image is loaded
from the installed Yaru theme through `resource://` URLs.

### The shell extension

`chromancy-theming@excelsies` does two things:

- **`shellTheme.js`** loads `~/.local/share/chromancy-theming/shell/gnome-shell.css` as the shell's theme
  stylesheet (`Main.setThemeStylesheet` and `Main.loadTheme`) and watches the file. A rewrite reloads it,
  and a removal returns to the stylesheet that was set before. A stylesheet St cannot parse is not
  loaded; the one already shown stays. Disabling the extension gives back the previous stylesheet.
- **`picker.js`** lets the user point at a window. It shows a crosshair and outlines the window under
  the pointer. A click picks the window; Esc or a timeout cancels. The extension exports this as
  `PickWindow` on GNOME Shell's session-bus connection (`io.github.excelsies.ChromancyTheming.Shell` at
  `/io/github/excelsies/ChromancyTheming/Shell`). The window's **Pick a Window** calls it and gets back
  the window's desktop file id and name.

### The other targets

| Target | Mechanism |
|---|---|
| `style` | `org.gnome.desktop.interface color-scheme`: `prefer-dark` for dark palettes, `default` for light |
| `fonts` | `font-name`, `document-font-name` and `monospace-font-name`; only the fonts the palette or the Fonts page gives |
| `flatpak` | Read-only grants for `xdg-config/gtk-4.0` and `xdg-config/gtk-3.0` in the user's global Flatpak overrides, as `flatpak override --user --filesystem=…:ro` writes them |
| `qt` | A qt6ct color scheme (QPalette's 21 roles per state), selected in `qt6ct.conf` with the custom palette on; `~/.config/environment.d/chromancy-theming.conf` sets `QT_QPA_PLATFORMTHEME=qt6ct` from the next login |
| `conjure` | Conjure Launcher's theming keys: its lock is honored, Chromancy names itself as the theme source, then writes the nine color tokens |
| `plaid` | Plaid's border settings: active border from the accent to the second accent, unfocused from `inactive-border`, scratchpad from the third accent |
| `ptyxis` | A palette file `Chromancy-<id>.palette`, selected in the default profile. Each palette gets its own file because a running Ptyxis does not reload a palette file it has already loaded |
| `btop` | `~/.config/btop/themes/chromancy-theming.theme`, selected with `color_theme` in `btop.conf` |
| `text-editor` | A GtkSourceView style scheme built from the terminal colors, selected in Text Editor's settings |
| `templates` | Each `~/.config/chromancy-theming/templates/*.tmpl` filled by `lib/template.js` and written to the path on its first line, which must be inside the home directory |
| `blacklist` | See below |

The Ptyxis, btop and Text Editor files come from `data/templates/`, filled by the same template engine as
the user's own.

## Applying and restoring

`app/runner.js` runs an Apply. For each enabled target it:

1. skips the target when its app is blacklisted (and restores what it wrote before);
2. runs `inspect`; a missing app is `skipped`;
3. reads the lock; a lock that is on, or that cannot be read, is `locked`, and nothing is written;
4. runs the Yaru build, if the target has one, in a temporary directory;
5. calls `plan` and collects the operations.

A target that fails before planning is reported and left exactly as it was; the others go ahead. All
the operations then go to `lib/applier.js` in one call.

### Operations

| Kind | Writes | Restore puts back |
|---|---|---|
| `file` | A whole file (`content: null` removes it; `encoding: 'base64'` for images) | The earlier file, or its absence |
| `line` | One marked line in a shared file (`gtk.css`) | The file without that line; the rest stays as the user left it |
| `ini` | One key of an INI file | That key only |
| `ini-list` | Items in a `;`-separated list key (Flatpak grants) | Removes only the items it added |
| `symlink` | A symlink (Snap `gtk.css` links for the blacklist) | The earlier link or file |
| `setting` | A GSettings key (with a path for relocatable schemas) | The earlier value, or the default if the user had never set it |

### The ledger

`~/.local/state/chromancy-theming/ledger.json` records, for every file and setting Chromancy has touched,
its state before the first change (the baseline) and what Chromancy last wrote:

```
{ "version": 1, "entries": { "<subject>": { target, kind, ref, baseline, written } } }
```

The applier's rules:

- The baseline is saved before the first write to a subject. If the ledger cannot be saved, nothing is
  written.
- An operation whose subject already has the wanted state is `unchanged` and is not written.
- A failed operation fails alone, and its result names the subject and the error.
- An Apply also restores the subjects its targets wrote before and no longer write. For example, a
  palette without fonts after one with fonts puts the fonts back.
- Restore returns each subject to its baseline even if something changed it since, and reports that it
  overwrote a change. It undoes in the reverse order of Apply.
- A ledger that cannot be read or parsed refuses both Apply and Restore. Treating it as empty would lose
  every baseline.

`app/system.js` does the real I/O. It writes files atomically, as a temporary file renamed over the old
one. It writes through symlinks to the file they point at, so a dotfiles manager's links stay links.

## The blacklist

An app is named by its desktop file id. `lib/blacklist.js` decides how to keep each kind out of the theme,
and the `blacklist` target writes it, so restore and un-blacklisting remove everything it made:

- **Host apps.** A user copy of the app's desktop file, and of its D-Bus service when it is D-Bus
  activated, runs it through `bin/chromancy-theming-unthemed`. That wrapper uses `bwrap` to bind an
  empty file over both `chromancy-theming.css` files for that process only, and unsets
  `QT_QPA_PLATFORMTHEME`. The user's own `gtk.css` rules still apply. If the sandbox cannot be set up,
  the app runs themed and the reason goes to the journal: an app that does not start is worse than one
  in the wrong colors.
- **Flatpak apps.** A per-app override denies `xdg-config/gtk-4.0` and `xdg-config/gtk-3.0`.
- **Snap apps.** The Snap's own `gtk.css` links point at a copy of the user's `gtk.css` without
  Chromancy's line. The Snap must have run once, so the links exist.
- **Ptyxis, btop and Text Editor.** Their own target is skipped, so they keep their colors.

## Settings

`~/.config/chromancy-theming/config.json` holds the window's choices: the selected palette, the one last
applied, the enabled targets (`null` means all), font overrides and the blacklist. `lib/config.js` reads
it field by field. A bad field falls back to its default with a warning, so a damaged file never stops
the app.

## Tests

| Suite | Command | Runs in |
|---|---|---|
| Unit | `pnpm test` | Node: palettes, derivation, ledger and applier rules, the targets' plans, templates, the Yaru transforms |
| GJS | `pnpm run test:gjs` | GJS with in-memory GSettings: the real I/O, the Yaru build and its exactness check, the blacklist |
| Display | `pnpm run test:display` | A headless Weston per script: the window, and real GTK 4 and GTK 3 widgets themed by Chromancy |
| Shell | `pnpm run test:shell` | A headless GNOME Shell per script: the extension's stylesheet loading and the window picker |
| CLI | `pnpm run test:cli` | The command line against a temporary home |

The display and shell harnesses give each run its own D-Bus session, runtime directory and XDG
directories, so they never touch the running desktop. They can also run at the same time as another
project's headless shell. The shell harness fails a run whose log has unexpected GNOME Shell criticals
(`tools/lib/criticals.js`). `tests/shared/applierScenarios.js` runs the same applier scenarios against an
in-memory system (`tests/helpers/memorySystem.js`) and against the real one, so the fake cannot drift from
the real I/O.
