const KEY = process.env.ALLIUM_API_KEY;
const URL = 'https://api.allium.so/api/v1/developer/wallet/positions';

async function call(pairs, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'X-API-KEY': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(pairs),
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 3000 * (i + 1))); continue; }
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  return { status: 429, json: null };
}

async function summarize(label, pairs) {
  const { status, json } = await call(pairs);
  console.log(`\n=== ${label} — HTTP ${status} ===`);
  if (!json?.items) { console.log(JSON.stringify(json)); return; }
  const items = json.items;
  console.log('total:', json.total, '| items returned:', items.length, '| cursor:', json.cursor);
  const byType = {};
  let sum = 0;
  for (const it of items) {
    (byType[it.position_type] ??= []).push(it);
    sum += Number(it.total_value_usd || 0);
  }
  console.log('position_types:', Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])));
  console.log('sum total_value_usd:', sum.toFixed(2));
  console.log('protocols:', [...new Set(items.map((i) => i.protocol))].join(', '));
  for (const [type, arr] of Object.entries(byType)) {
    console.log(`\n--- full example of position_type="${type}" (keys: ${Object.keys(arr[0]).join(', ')}) ---`);
    console.log(JSON.stringify(arr[0], null, 2));
  }
}

await summarize('rich wallet eth+base', [
  { chain: 'ethereum', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
  { chain: 'base', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
]);
await new Promise((r) => setTimeout(r, 4000));
await summarize('consent wallet eth', [
  { chain: 'ethereum', address: '0xea0B8332c3438BeB43c13cB04516557ff4541bE8' },
]);
