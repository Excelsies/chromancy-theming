# Chromancy Theming

Chromancy Theming applies one palette and one set of fonts across the GNOME desktop: libadwaita and
GTK 3 apps, the GNOME Shell menus, Qt and Flatpak apps, and the config files of apps that keep
their own colors, such as terminals.

It is in early development: there is a command line, and the window is still to come.

## Usage

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
