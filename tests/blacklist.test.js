import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appKind, wrapExec, busName, APP_TARGETS, BLACKLIST_MARKER } from '../lib/blacklist.js';

const W = '/opt/chromancy/bin/chromancy-theming-unthemed';
const settings = '[Desktop Entry]\nName=Settings\nExec=gnome-control-center\nDBusActivatable=true\n\n[Desktop Action wifi]\nExec=gnome-control-center wifi\n';

test('wrapExec runs every Exec line through the wrapper and marks the file', () => {
    const out = wrapExec(settings, W);
    assert.match(out, new RegExp(`^${BLACKLIST_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    assert.match(out, /^Exec=\/opt\/chromancy\/bin\/chromancy-theming-unthemed gnome-control-center$/m);
    assert.match(out, /^Exec=\/opt\/chromancy\/bin\/chromancy-theming-unthemed gnome-control-center wifi$/m);
    assert.match(out, /^Name=Settings$/m);
});

test('wrapExec is idempotent: a wrapped file is not wrapped again', () => {
    assert.equal(wrapExec(wrapExec(settings, W), W), wrapExec(settings, W));
});

test('a D-Bus service file is wrapped the same way', () => {
    const svc = '[D-BUS Service]\nName=org.gnome.Settings\nExec=/usr/bin/gnome-control-center --gapplication-service\n';
    assert.match(wrapExec(svc, W), /^Exec=\/opt\/chromancy\/bin\/chromancy-theming-unthemed \/usr\/bin\/gnome-control-center --gapplication-service$/m);
});

test('appKind tells host, Flatpak and Snap apps apart from the desktop file', () => {
    assert.deepEqual(appKind(settings), { kind: 'host', dbus: true });
    assert.deepEqual(appKind('[Desktop Entry]\nExec=/usr/bin/flatpak run org.x.App\nX-Flatpak=org.x.App\n'), { kind: 'flatpak', flatpakId: 'org.x.App' });
    assert.deepEqual(appKind('[Desktop Entry]\nExec=/snap/bin/firefox %u\nX-SnapInstanceName=firefox\n'), { kind: 'snap', snapName: 'firefox' });
    assert.deepEqual(appKind('[Desktop Entry]\nExec=foo\n'), { kind: 'host', dbus: false });
});

test('the bus name of a D-Bus-activatable app is its desktop id without .desktop', () => {
    assert.equal(busName('org.gnome.Settings.desktop'), 'org.gnome.Settings');
});

test('blacklisting the terminal or editor turns off their own targets', () => {
    assert.equal(APP_TARGETS['org.gnome.Ptyxis.desktop'], 'ptyxis');
    assert.equal(APP_TARGETS['org.gnome.TextEditor.desktop'], 'text-editor');
    assert.equal(APP_TARGETS['btop.desktop'], 'btop');
});
