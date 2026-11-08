// Flatpak apps: lets every Flatpak app read the GTK 4 and GTK 3 stylesheets (a read-only grant in the
// user's global Flatpak overrides, as `flatpak override --user --filesystem=...:ro` writes it). Apps
// pick it up when they next start. Restore removes only the grants Chromancy added.

const GRANTS = Object.freeze(['xdg-config/gtk-4.0:ro', 'xdg-config/gtk-3.0:ro']);

export const flatpak = {
    id: 'flatpak',
    title: 'Flatpak apps',
    lock: 'none',
    async inspect(ctx) {
        return (await ctx.system.hasProgram('flatpak')) ? { available: true } : { available: false, reason: 'Flatpak is not installed' };
    },
    plan(_palette, { paths }) {
        return [{ target: 'flatpak', kind: 'ini-list', path: `${paths.data}/flatpak/overrides/global`, group: 'Context', key: 'filesystems', items: [...GRANTS] }];
    },
};
