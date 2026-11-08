// Tiny test harness for automation scripts running inside a headless GNOME Shell
// (tools/shell-test.sh). Each check prints "ok - ..." or "not ok - ..."; run() throws at the end
// if anything failed, which makes the shell exit non-zero.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Suite {
    constructor() {
        this.failures = [];
        this.count = 0;
    }

    check(name, cond, detail = '') {
        this.count++;
        if (cond) {
            console.log(`ok - ${name}`);
        } else {
            console.log(`not ok - ${name}${detail ? ` (${detail})` : ''}`);
            this.failures.push(name);
        }
    }

    equal(name, actual, expected) {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        this.check(name, a === e, `expected ${e}, got ${a}`);
    }

    finish() {
        console.log(`# ${this.count - this.failures.length}/${this.count} passed`);
        if (this.failures.length)
            throw new Error(`${this.failures.length} check(s) failed: ${this.failures.join('; ')}`);
    }
}

export function sleep(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

/** Poll until fn() is truthy or the timeout passes; returns the last value. */
export async function waitFor(fn, timeoutMs = 3000) {
    const end = GLib.get_monotonic_time() + timeoutMs * 1000;
    let v = fn();
    while (!v && GLib.get_monotonic_time() < end) {
        await sleep(20);
        v = fn();
    }
    return v;
}

export function extension() {
    return Main.extensionManager.lookup(GLib.getenv('CHROMANCY_TEST_UUID'));
}

const seat = () => Clutter.get_default_backend().get_default_seat();
let keyboard = null;
let pointer = null;

function now() {
    return GLib.get_monotonic_time();
}

/** Press and release a key chord through a virtual keyboard (real input path). */
export async function pressKeys(...keyvals) {
    keyboard ??= seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    for (const k of keyvals)
        keyboard.notify_keyval(now(), k, Clutter.KeyState.PRESSED);
    for (const k of [...keyvals].reverse())
        keyboard.notify_keyval(now(), k, Clutter.KeyState.RELEASED);
    await sleep(100);
}

/** Click at stage coordinates through a virtual pointer. */
export async function clickAt(x, y) {
    pointer ??= seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    pointer.notify_absolute_motion(now(), x, y);
    await sleep(50);
    pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
    pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
    await sleep(100);
}
