/**
 * Allium positions client (the Rendering layer, spine step 4).
 *
 * Turns an attested wallet set into a unified behavioral profile: LP positions,
 * staking, lending, and holdings across protocols and chains. Phora hands over the
 * RAW Allium data — it computes no score, grade, or risk number. Raw sums are fine;
 * derived ratings are not (see the IP fence in the README/non-goals).
 *
 * Server-side only: the ALLIUM_API_KEY never reaches the client.
 */

const POSITIONS_ENDPOINT =
  'https://api.allium.so/api/v1/developer/wallet/positions';

/** A (chain, address) pair to query — the API accepts several at once. */
export interface WalletPair {
  chain: string;
  address: string;
}

export interface AlliumToken {
  object?: string;
  chain: string;
  address: string;
  decimals: number;
  info: { name: string; symbol: string } | null;
}

interface BasePosition {
  chain: string;
  address: string;
  position_id: string;
  protocol: string;
  total_value_usd: string;
  position_type: string;
  pool_address: string | null;
}

/** Uniswap-style liquidity position. */
export interface LpPosition extends BasePosition {
  position_type: 'LP';
  fee_tier: string | null;
  in_range: boolean | null;
  token0: AlliumToken;
  token1: AlliumToken;
  token0_amount: string;
  token1_amount: string;
  token0_amount_usd: string;
  token1_amount_usd: string;
  unclaimed_fees_token0: string;
  unclaimed_fees_token1: string;
  unclaimed_fees_usd: string;
}

/** Staking position (Lido stETH/wstETH, cbETH, …). */
export interface StakedPosition extends BasePosition {
  position_type: 'staked';
  staked_token: AlliumToken;
  staked_amount: string;
  staked_amount_usd: string;
  rewards_token: AlliumToken | null;
  unclaimed_rewards: string | null;
  unclaimed_rewards_usd: string | null;
  rewards_additive: boolean | null;
  apy: string | null;
}

/** A token leg inside a lending position (supply/borrow/collateral). */
export interface LendingLeg {
  token?: AlliumToken;
  amount?: string;
  amount_usd?: string;
  apy?: string | null;
}

/** Money-market position. health_factor is the protocol's OWN underwriting number. */
export interface LendingPosition extends BasePosition {
  position_type: 'lending';
  supplies?: LendingLeg[];
  borrows?: LendingLeg[];
  collateral?: LendingLeg[];
  health_factor?: string | number | null;
}

/** Anything else (plain holdings, future types) — rendered generically. */
export type GenericPosition = BasePosition & Record<string, unknown>;

export type Position =
  | LpPosition
  | StakedPosition
  | LendingPosition
  | GenericPosition;

interface PositionsPage {
  items: Position[];
  cursor: string | null;
  total: number | null;
}

export class AlliumError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Allium positions request failed (${status})`);
  }
}

/** POST to Allium, retrying on 429 with exponential backoff (the API rate-limits). */
async function fetchWithBackoff(
  url: string,
  key: string,
  pairs: WalletPair[],
): Promise<Response> {
  let res: Response | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(pairs),
      cache: 'no-store', // positions are never cached — always the live snapshot
    });
    if (res.status !== 429) return res;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return res as Response;
}

/**
 * Fetch every position for the given (chain, address) pairs, following the cursor
 * to completion (the API pages, sorted by value descending). Bounded page count so a
 * runaway cursor can't loop forever.
 */
export async function fetchPositions(pairs: WalletPair[]): Promise<Position[]> {
  const key = process.env.ALLIUM_API_KEY;
  if (!key) throw new Error('ALLIUM_API_KEY is not set');

  const items: Position[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const url = cursor
      ? `${POSITIONS_ENDPOINT}?cursor=${encodeURIComponent(cursor)}`
      : POSITIONS_ENDPOINT;
    const res = await fetchWithBackoff(url, key, pairs);
    if (!res.ok) throw new AlliumError(res.status, await res.text());
    const json = (await res.json()) as PositionsPage;
    items.push(...(json.items ?? []));
    cursor = json.cursor ?? null;
    if (!cursor) break;
  }
  return items;
}

/** Raw sum of total_value_usd across positions — a sum, never a derived score. */
export function sumValueUsd(items: Position[]): number {
  return items.reduce((s, p) => s + (Number(p.total_value_usd) || 0), 0);
}
