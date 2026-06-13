import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

/**
 * Runtime database client. Uses the POOLED connection string (DATABASE_URL) over
 * Neon's stateless HTTP driver — the right fit for serverless route handlers.
 * Migrations use the direct/unpooled connection instead (see drizzle.config.ts).
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return url;
}

export const db = drizzle(neon(getDatabaseUrl()), { schema });
export { schema };
