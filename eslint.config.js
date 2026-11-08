import js from '@eslint/js';
import globals from 'globals';

// GJS globals available to the app and inside GNOME Shell.
const gjsGlobals = {
    ARGV: 'readonly',
    global: 'readonly',
    imports: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
};

export default [
    { ignores: ['node_modules/', 'dist/'] },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.es2024, ...gjsGlobals, console: 'readonly' },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'prefer-const': 'error',
            eqeqeq: ['error', 'always'],
        },
    },
    {
        // lib/ is unit-tested under node, so it must not touch GJS or Shell APIs.
        files: ['lib/**/*.js'],
        rules: {
            'no-restricted-imports': ['error', { patterns: ['gi://*', 'resource://*'] }],
            'no-restricted-globals': ['error', 'global', 'imports', 'log', 'logError'],
        },
    },
    {
        files: ['tests/**/*.js', 'tools/**/*.js', 'eslint.config.js'],
        languageOptions: { globals: { ...globals.node } },
    },
];
