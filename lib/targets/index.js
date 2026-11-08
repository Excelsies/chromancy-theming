// Every target Chromancy can apply a palette to. A target plans operations from a resolved palette;
// it never writes anything itself. `lock` is 'none' or an async reader of the app's own
// "don't let other apps change my theme" switch. `inspect`, when present, finds out whether the app is
// there and what plan() needs (passed as ctx.info); an absent app is reported as skipped. A target with
// `build` needs that builder's output (app/yaruBuild.js) passed to plan() as its third argument.

import { btop, ptyxis, textEditor } from './apps.js';
import { conjure } from './conjure.js';
import { flatpak } from './flatpak.js';
import { fonts } from './fonts.js';
import { gtk3 } from './gtk3.js';
import { gtk4 } from './gtk4.js';
import { plaid } from './plaid.js';
import { qt } from './qt.js';
import { shell } from './shell.js';
import { style } from './style.js';
import { userTemplates } from './userTemplates.js';

export const TARGETS = Object.freeze([style, gtk4, gtk3, shell, fonts, flatpak, qt, conjure, plaid, ptyxis, btop, textEditor, userTemplates]);
