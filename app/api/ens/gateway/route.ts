import { NextResponse } from 'next/server';
import { isAddress, isHex } from 'viem';
import { phoraGateway } from '@/lib/ens/gateway';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ens/gateway
 *
 * The CCIP-Read (EIP-3668) gateway endpoint embedded in the OffchainResolver's URL.
 * A resolving client (viem/ensjs) POSTs `{ sender, data }`; we answer the resolver
 * query from the live registry and return `{ data }` (the signed resolve() result).
 */
export async function POST(request: Request) {
  let body: { sender?: string; data?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const { sender, data } = body;
  if (!sender || !data || !isAddress(sender) || !isHex(data)) {
    return NextResponse.json({ message: 'Invalid request format' }, { status: 400 });
  }

  const response = await phoraGateway.call({ to: sender, data });
  return NextResponse.json(response.body, { status: response.status });
}
