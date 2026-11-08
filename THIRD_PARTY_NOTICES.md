# Third-party notices

Chromancy Theming is MIT-licensed (see LICENSE). Some of its built-in palettes are derived from the
following works.

## Noctalia

The UI colors of the Ayu, Catppuccin, Dracula, Eldritch, Gruvbox, Kanagawa, Noctalia, Nord, Rosé Pine
and Tokyo Night palettes in `data/palettes/` come from Noctalia's built-in dark palettes
(https://github.com/noctalia-dev/noctalia, `src/theme/builtin_palettes.cpp` at commit 60861c9), reduced
to the nine UI color roles, as Conjure Launcher uses them. One text color is adjusted for contrast:
Nord's text on hover, `#2e3440` to `#000000`.

```
MIT License

Copyright (c) 2026 noctalia-dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Gogh

The terminal colors of every built-in palette except Jeweltone, Eldritch and Noctalia, and the UI colors of
the Aura, Gotham, Jellybeans, Molokai, Moonfly, Night Owl, Oceanic Next, One Half Black, Oxocarbon and
Tomorrow Night palettes, of Everforest Dark, GitHub Dark, One Dark and Solarized Dark, and of every light
palette except Jeweltone Light (Ayu Light, Belafonte Day, Bluloco Light, Breath Light, Catppuccin Latte,
Everforest Light, GitHub Light, Google Light, Gruvbox Light, Hemisu Light, Horizon Light, Lunaria Light,
Nord Light, Novel, One Light, PaperColor Light, Pencil Light, Rosé Pine Dawn, Selenized Light, Solarized
Light, Tokyo Night Day, Tomorrow, Ura, VS Code Light), come from terminal palettes in the Gogh collection
(https://github.com/Gogh-Co/Gogh), as bundled with Ptyxis 50.1. Gogh is dual-licensed under the MIT
License and the Apache License 2.0; these are used under the MIT License.

## Yaru

`vendor/yaru/` holds part of Yaru, Ubuntu's theme (https://github.com/ubuntu/yaru), at the commit
and version named in `vendor/yaru/SOURCE`: the GTK 3 and GNOME Shell SCSS sources and the files they
need. Yaru's code is licensed under the GNU General Public License version 3 (`vendor/yaru/COPYING`)
and its graphics under Creative Commons Attribution-ShareAlike 4.0 (`vendor/yaru/LICENSE_CCBYSA`);
its authors are listed in `vendor/yaru/AUTHORS`.

Chromancy builds stylesheets from these sources with a palette. At build time it marks the color
variables it sets as `!default`, writes the build's entry files, replaces the shell's runtime accent
with the palette's, and changes `optimize-contrast()` in `sass-utils.scss` to try the other direction
instead of stopping when a contrast target is out of reach. The stylesheets it builds are derived from
Yaru and covered by Yaru's licenses.

## qt6ct

`tests/fixtures/qt6ct/simple.conf` is one of the color schemes bundled with qt6ct 0.11
(https://www.opencode.net/trialuser/qt6ct), used to check that Chromancy writes qt6ct's format. qt6ct is
licensed under the BSD 2-Clause License.
