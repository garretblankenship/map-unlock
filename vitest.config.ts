import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Screen render tests in __tests__/ run in Jest (jest-expo).
    exclude: [...configDefaults.exclude, '__tests__/**'],
  },
});
