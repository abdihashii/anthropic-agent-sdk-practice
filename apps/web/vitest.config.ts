import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [viteReact()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      exclude: [
        'src/components/ui/**',
        'src/test-utils/**',
        'src/routes/**',
        'src/router.tsx',
        '**/*.config.*',
        '**/*.setup.*',
        '**/routeTree.gen.ts',
      ],
    },
  },
})
