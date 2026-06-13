import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { identities } from '@/lib/db/schema';
import { authenticateIdentity } from '@/lib/identity';

export const dynamic = 'force-dynamic';

/**
 * POST /api/identity/username
 *
 * Assign the caller's platform username (→ username.phora.eth). Globally unique,
 * must be a valid ENS label.
 */
export async function POST(request: Request) {
  const auth = await authenticateIdentity(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { username?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const username = typeof body.username === 'string' ? body.username.toLowerCase().trim() : '';
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(username)) {
    return NextResponse.json(
      { error: 'username must be a valid ENS label (a-z, 0-9, hyphens)' },
      { status: 400 },
    );
  }

  try {
    const [row] = await db
      .update(identities)
      .set({ username })
      .where(eq(identities.id, auth.identity.id))
      .returning({ username: identities.username });
    return NextResponse.json({
      status: 'username_set',
      username: row.username,
      name: `${row.username}.${'phora.eth'}`,
    });
  } catch (err) {
    if (/unique|23505/i.test(String((err as Error)?.message))) {
      return NextResponse.json({ error: 'username already taken' }, { status: 409 });
    }
    throw err;
  }
}
