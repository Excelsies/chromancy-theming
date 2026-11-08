# Chromancy Theming

Chromancy Theming applies one palette and one set of fonts across the GNOME desktop: libadwaita and
GTK 3 apps, the GNOME Shell menus, Qt and Flatpak apps, and the config files of apps that keep
their own colors, such as terminals.

It is in early development and not yet usable.

## Requirements

GNOME Shell 50 (developed on Ubuntu 26.04).

## Requirements for building

`sassc` (`sudo apt install sassc`) rebuilds Yaru's GTK 3 and shell stylesheets with a palette.
`rsvg-convert` (`sudo apt install librsvg2-bin`) recolors the few Yaru images that use the accent.

## License

MIT (see `LICENSE`), except `vendor/yaru/`, which is Yaru's GPL-3.0 and CC BY-SA 4.0 licensed source;
see `THIRD_PARTY_NOTICES.md`.
