// Every target Chromancy can apply a palette to. A target plans operations from a resolved palette;
// it never writes anything itself. `lock` is 'none' or an async reader of the app's own
// "don't let other apps change my theme" switch. A target with `build` needs that builder's output
// (app/yaruBuild.js) passed to plan() as its third argument.

import { fonts } from './fonts.js';
import { gtk3 } from './gtk3.js';
import { gtk4 } from './gtk4.js';
import { shell } from './shell.js';
import { style } from './style.js';

export const TARGETS = Object.freeze([style, gtk4, gtk3, shell, fonts]);
