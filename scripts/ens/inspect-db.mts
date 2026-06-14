process.loadEnvFile('.env.local');
import { db } from '@/lib/db';
import { identities, attestationEvents } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';

const ids = await db.select().from(identities);
console.log('identities:', ids.length);
for (const i of ids) {
  console.log(`  id=${i.id} username=${i.username ?? '(none)'} nullifier=${i.worldIdNullifier.slice(0, 14)}… dynamicUser=${i.dynamicUserId.slice(0, 12)}…`);
}

const events = await db.select().from(attestationEvents).orderBy(asc(attestationEvents.seq));
console.log('\nattestation_events:', events.length);
for (const e of events) {
  console.log(`  seq=${e.seq} type=${e.eventType} wallet=${e.walletAddress ?? '-'} useCase=${e.useCaseLabel ?? '-'} target=${e.targetSeq ?? '-'} canon=${e.canonVersion ?? 'null'}`);
}
