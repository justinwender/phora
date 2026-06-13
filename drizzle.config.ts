import { defineConfig } from 'drizzle-kit';

// drizzle-kit doesn't auto-load env files. Pull the unpooled URL from .env.local
// when it isn't already in the environment (Node >= 20.12 provides loadEnvFile),
// so `npm run db:migrate` works without manually exporting the variable.
if (!process.env.DATABASE_URL_UNPOOLED) {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // No .env.local (e.g. CI with the variable already set) — ignore.
  }
}

/**
 * Drizzle Kit config for generating and applying migrations.
 *
 * Migrations run against the DIRECT (unpooled) connection — DDL and migration
 * advisory locks don't play well through the pooler. The unpooled URL is passed
 * in the environment when invoking drizzle-kit (sourced from .env.local), so it
 * never needs to live in the app's runtime config.
 */
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
});
