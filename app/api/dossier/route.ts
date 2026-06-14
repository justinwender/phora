import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { fetchPositions, sumValueUsd, AlliumError } from '@/lib/allium';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dossier?address=0x…&chain=ethereum,base
 *
 * The Rendering layer: an attested wallet's unified behavioral profile from Allium.
 * `chain` is one or more comma-separated chains queried together (e.g. the same wallet
 * on ethereum AND base). Returns the RAW positions plus a raw value sum — no score,
 * grade, or risk number is computed here (see the IP fence in the non-goals).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const chainParam = searchParams.get('chain') ?? 'ethereum';

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: 'Missing or invalid `address`' },
      { status: 400 },
    );
  }
  const chains = chainParam
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (chains.length === 0) {
    return NextResponse.json({ error: 'Missing `chain`' }, { status: 400 });
  }

  const pairs = chains.map((chain) => ({ chain, address: address.toLowerCase() }));

  try {
    const items = await fetchPositions(pairs);
    return NextResponse.json({
      address,
      chains,
      count: items.length,
      // Raw sum of the position values — a sum, deliberately not a derived score.
      totalValueUsd: sumValueUsd(items),
      items,
    });
  } catch (err) {
    if (err instanceof AlliumError) {
      return NextResponse.json(
        { error: 'Allium request failed', status: err.status },
        { status: err.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json(
      { error: (err as Error).message ?? 'Unexpected error' },
      { status: 500 },
    );
  }
}
