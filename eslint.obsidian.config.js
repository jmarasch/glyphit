// Obsidian's own plugin guidelines, the same rule set their community
// directory review runs. Kept separate from eslint.config.js so day-to-day
// linting stays fast and green while compliance is worked through.
//
//   npm run lint:obsidian
//
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig(
  eslint.configs.recommended,
  ...obsidianmd.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        // Many of Obsidian's rules are type-aware.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Tests are not shipped, so plugin runtime rules do not apply to them.
    ignores: ['**/*.test.ts', 'src/icon-pack-manager/test-utils.ts'],
  },
);
