import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/__tests__/**/*.{test,spec}.?(ts|tsx)'],
    exclude: [
      'node_modules',
      'supabase/**',
      'EA-Coder-App/**',
      'EACoder/**',
      'ea-coder/**',
      'android/**',
      'ios/**'
    ],
  },
});