# Chromancy Theming

Chromancy Theming applies one palette and one set of fonts across the GNOME desktop: libadwaita and
GTK 3 apps, the GNOME Shell menus, Qt and Flatpak apps, and the config files of apps that keep
their own colors, such as terminals.

It is in early development: the window and the command line work; the blacklist and more targets are to come.

## Usage

`tools/install.sh` adds Chromancy Theming to the app grid and links the shell extension (`--remove`
takes both away). The window lists the palettes with a live preview; **Customize…** saves an edited copy
as your own palette, **Fonts** sets fonts that replace the palette's, **Apply To** picks the targets, and
**Apply** and **Restore** do the work. The shell extension starts after the next login.

The same from the command line, using the targets and fonts chosen in the window:

```sh
bin/chromancy-theming list                      # the palettes, built-in and your own
bin/chromancy-theming apply jeweltone-dark      # apply one to every target
bin/chromancy-theming apply nord --targets=gtk4,style
bin/chromancy-theming restore                   # put everything back as it was
```

Targets:

| Target | What it changes |
|---|---|
| `style` | GNOME's light/dark preference, from the palette's variant |
| `gtk4` | GTK 4 and libadwaita apps: `~/.config/gtk-4.0/chromancy-theming.css`, imported from `gtk.css` |
| `gtk3` | GTK 3 apps: Yaru rebuilt with the palette, in `~/.config/gtk-3.0/`, imported from `gtk.css` |
| `shell` | GNOME Shell: Yaru's shell theme rebuilt with the palette; the `chromancy-theming@excelsies` extension loads it |
| `fonts` | The interface, document and monospace fonts, when the palette sets them |
| `flatpak` | Lets Flatpak apps read the GTK stylesheets (a read-only grant in `~/.local/share/flatpak/overrides/global`) |
| `qt` | Qt apps through qt6ct: a color scheme, selected in `qt6ct.conf`, and `QT_QPA_PLATFORMTHEME=qt6ct` from the next login |
| `conjure` | Conjure Launcher's colors, through its theming keys, unless it is set to keep its own |
| `plaid` | Plaid's active, unfocused and scratchpad window borders |
| `ptyxis` | A Chromancy palette, selected in Ptyxis's default profile |
| `btop` | A Chromancy theme for btop, selected in `btop.conf` |
| `text-editor` | A style scheme for Text Editor's writing area, from the terminal colors |
| `templates` | Your own templates (below) |
| `blacklist` | Keeps the apps on the blacklist out of the theme (below) |

Targets whose app is not installed are skipped. Ptyxis, btop and Text Editor need the palette's terminal
colors; with a palette that has none they go back to how they were before Chromancy.

### Keeping apps out of the theme

The window's **Blacklist** page adds an app from a list, or by clicking one of its windows (**Pick a
Window**, which needs the shell extension). From the command line:

```sh
bin/chromancy-theming blacklist                                  # list
bin/chromancy-theming blacklist add org.gnome.Calculator.desktop
bin/chromancy-theming blacklist remove org.gnome.Calculator.desktop
```

A blacklisted app keeps its own colors from its next start:

- a regular app starts through `bin/chromancy-theming-unthemed` (a copy of its launcher in
  `~/.local/share/applications`, and of its D-Bus service when it has one), which hides Chromancy's
  stylesheets from that app only; your own `gtk.css` rules still apply. Started from a terminal, it is
  themed as usual;
- a Flatpak app is denied the GTK stylesheet folders (`~/.local/share/flatpak/overrides/<app-id>`);
- a Snap app's own `gtk.css` links point at a copy of your `gtk.css` without Chromancy's line (a Snap must
  have been run once first);
- Ptyxis, btop and Text Editor keep their own colors: their Chromancy targets are skipped.

Taking an app off the blacklist, or Restore, removes all of it.

### Your own templates

Files in `~/.config/chromancy-theming/templates/*.tmpl` are filled with the palette and written where their
first line says, inside your home directory:

```
chromancy-output: ~/.config/kitty/chromancy.conf
background {{term-background}}
foreground {{term-foreground}}
color1 {{ansi1}}
```

Every color has a name: `{{primary}}`, `{{on-primary}}`, `{{surface}}`, `{{surface-container}}`,
`{{on-surface}}`, `{{on-surface-variant}}`, `{{outline-variant}}`, `{{hover}}`, `{{on-hover}}`,
`{{secondary}}`, `{{tertiary}}`, `{{inactive-border}}`, `{{error}}`, `{{success}}`, `{{warning}}`; with
terminal colors, `{{term-background}}`, `{{term-foreground}}`, `{{term-cursor}}`, `{{term-cursor-text}}` and
`{{ansi0}}` to `{{ansi15}}`. Add `.hex` for the value without `#` (`{{primary.hex}}`). `{{name}}` and
`{{variant}}` are the palette's name and `dark` or `light`. An unknown name stops that target with an error.

Chromancy adds one marked line to each `gtk.css` and leaves the rest of the file as you wrote it.
Restore puts every file and setting back as it was before Chromancy first changed it, and removes only
its own line from `gtk.css`. Apps that are already open keep their colors until they are restarted.

Your own palettes go in `~/.config/chromancy-theming/palettes/<id>.json`, in the same format as
`data/palettes/`.

## Requirements

GNOME Shell 50 (developed on Ubuntu 26.04).

## Requirements for building

`sassc` (`sudo apt install sassc`) rebuilds Yaru's GTK 3 and shell stylesheets with a palette.
`rsvg-convert` (`sudo apt install librsvg2-bin`) recolors the few Yaru images that use the accent.

## License

MIT (see `LICENSE`), except `vendor/yaru/`, which is Yaru's GPL-3.0 and CC BY-SA 4.0 licensed source;
see `THIRD_PARTY_NOTICES.md`.
