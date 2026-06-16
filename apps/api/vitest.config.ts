import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
        keepClassNames: true,
      },
    }),
  ],
  test: {
    globals: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['test/**/*.spec.ts'],
    // forgot-password returns the reset token in the body only when this is on; tests
    // need it to exercise the full forgot -> reset flow without an email transport.
    env: {
      NODE_ENV: 'test',
      AUTH_DEV_RESET_TOKEN_RESPONSE: 'true',
    },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    silent: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      // Exclude bootstrap, dev tooling, generated/data files and type-only modules
      // that integration tests can't meaningfully cover.
      exclude: [
        'src/main.ts',
        'src/audit-contracts.ts',
        'src/**/*.module.ts',
        'src/db/migrate.ts',
        'src/db/data-migrate.ts',
        'src/db/backup.ts',
        'src/db/reset.ts',
        'src/db/lint-migrations.ts',
        'src/db/seed/**',
        'src/db/migrations/**',
        'src/db/data-migrations/**',
        'src/shared/observability/telemetry.ts',
        'src/**/*.d.ts',
      ],
      // Conservative floor to prevent regression toward zero; ratchet upward as
      // unit/integration coverage grows.
      thresholds: {
        lines: 25,
        functions: 25,
        statements: 25,
        branches: 25,
      },
    },
  },
});
