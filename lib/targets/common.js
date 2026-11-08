// Helpers shared by targets.

/** Thrown by plan() when a target has nothing to do for this palette; reported as skipped. */
export class TargetSkipped extends Error {
    constructor(message) {
        super(message);
        this.name = 'TargetSkipped';
    }
}

/**
 * Finds a GNOME Shell extension's settings schema: the user's install, then the system's.
 * @returns {Promise<{schemaDir: string, keys: string[]} | null>}
 */
export async function extensionSchema(ctx, uuid, schema) {
    const dirs = [`${ctx.paths.data}/gnome-shell/extensions/${uuid}/schemas`, `/usr/share/gnome-shell/extensions/${uuid}/schemas`];
    for (const schemaDir of dirs) {
        const keys = await ctx.system.schemaKeys(schema, schemaDir);
        if (keys)
            return { schemaDir, keys };
    }
    return null;
}

/** Reads a bundled template (data/templates/<name>). */
export async function bundledTemplate(ctx, name) {
    const text = await ctx.system.readText(`${ctx.templatesDir}/${name}`);
    if (text === null)
        throw new Error(`template ${name} is missing from ${ctx.templatesDir}`);
    return text;
}

export function requireTerminal(palette) {
    if (!palette.terminal)
        throw new TargetSkipped(`the palette "${palette.name}" has no terminal colors`);
}
