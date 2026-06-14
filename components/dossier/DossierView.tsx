import type {
  Position,
  LpPosition,
  StakedPosition,
  LendingPosition,
  LendingLeg,
  AlliumToken,
} from '@/lib/allium';

export interface Dossier {
  address: string;
  chains: string[];
  count: number;
  totalValueUsd: number;
  items: Position[];
}

// ── formatting ──────────────────────────────────────────────────────────────
function fmtUsd(v: string | number | null | undefined): string {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function fmtAmount(v: string | number | null | undefined): string {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toPrecision(3);
}

function sym(t: AlliumToken | null | undefined): string {
  return t?.info?.symbol ?? (t?.address ? `${t.address.slice(0, 6)}…` : '?');
}

const PROTOCOL_LABELS: Record<string, string> = {
  uniswap_v3: 'Uniswap V3',
  uniswap_v4: 'Uniswap V4',
  lido_steth: 'Lido stETH',
  lido_wsteth: 'Lido wstETH',
  cbeth: 'Coinbase cbETH',
  aave_v3: 'Aave V3',
  aave_v2: 'Aave V2',
  compound_v3: 'Compound V3',
};
function protocolLabel(p: string): string {
  return (
    PROTOCOL_LABELS[p] ??
    p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function feeTierPct(t: string | null): string | null {
  const n = Number(t);
  if (!t || !isFinite(n)) return null;
  return `${parseFloat((n / 10000).toFixed(4))}%`;
}

// ── shared chrome ───────────────────────────────────────────────────────────
function Badge({ children, tone = 'zinc' }: { children: React.ReactNode; tone?: 'zinc' | 'green' | 'amber' | 'blue' }) {
  const tones = {
    zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function CardShell({
  protocol,
  chain,
  typeLabel,
  right,
  badges,
  children,
}: {
  protocol: string;
  chain: string;
  typeLabel: string;
  right: React.ReactNode;
  badges?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.10] dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-black dark:text-zinc-50">
              {protocolLabel(protocol)}
            </span>
            <Badge>{typeLabel}</Badge>
            <Badge tone="blue">{chain}</Badge>
            {badges}
          </div>
        </div>
        <div className="text-right">{right}</div>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function Value({ usd }: { usd: string | number }) {
  return (
    <div className="text-base font-semibold tabular-nums text-black dark:text-zinc-50">
      {fmtUsd(usd)}
    </div>
  );
}

function Leg({ amount, symbol, usd }: { amount: string; symbol: string; usd: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
        {fmtAmount(amount)} <span className="text-zinc-500">{symbol}</span>
      </span>
      <span className="tabular-nums text-zinc-500">≈ {fmtUsd(usd)}</span>
    </div>
  );
}

// ── per-type cards ──────────────────────────────────────────────────────────
function LpCard({ p }: { p: LpPosition }) {
  const range =
    p.in_range === true ? (
      <Badge tone="green">In range</Badge>
    ) : p.in_range === false ? (
      <Badge tone="amber">Out of range</Badge>
    ) : null;
  const fee = feeTierPct(p.fee_tier);
  return (
    <CardShell
      protocol={p.protocol}
      chain={p.chain}
      typeLabel="LP"
      right={<Value usd={p.total_value_usd} />}
      badges={
        <>
          {range}
          {fee ? <Badge>{fee} fee</Badge> : null}
        </>
      }
    >
      <div className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        {sym(p.token0)} / {sym(p.token1)}
      </div>
      <div className="flex flex-col gap-1 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
        <Leg amount={p.token0_amount} symbol={sym(p.token0)} usd={p.token0_amount_usd} />
        <Leg amount={p.token1_amount} symbol={sym(p.token1)} usd={p.token1_amount_usd} />
      </div>
      <div className="mt-2 flex justify-between border-t border-black/[.06] pt-2 text-xs text-zinc-500 dark:border-white/[.08]">
        <span>Unclaimed fees</span>
        <span className="tabular-nums">{fmtUsd(p.unclaimed_fees_usd)}</span>
      </div>
    </CardShell>
  );
}

function StakedCard({ p }: { p: StakedPosition }) {
  return (
    <CardShell
      protocol={p.protocol}
      chain={p.chain}
      typeLabel="Staked"
      right={<Value usd={p.total_value_usd} />}
      badges={p.apy ? <Badge tone="green">{p.apy}% APY</Badge> : null}
    >
      <div className="flex flex-col gap-1">
        <Leg amount={p.staked_amount} symbol={sym(p.staked_token)} usd={p.staked_amount_usd} />
        {p.unclaimed_rewards && Number(p.unclaimed_rewards) > 0 ? (
          <div className="flex justify-between border-t border-black/[.06] pt-1.5 text-xs text-zinc-500 dark:border-white/[.08]">
            <span>
              Rewards · {fmtAmount(p.unclaimed_rewards)} {sym(p.rewards_token)}
            </span>
            <span className="tabular-nums">≈ {fmtUsd(p.unclaimed_rewards_usd)}</span>
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}

function LegList({ title, legs }: { title: string; legs?: LendingLeg[] }) {
  if (!legs || legs.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
        {title}
      </div>
      <div className="flex flex-col gap-1">
        {legs.map((l, i) => (
          <Leg
            key={i}
            amount={String(l.amount ?? '')}
            symbol={sym(l.token)}
            usd={String(l.amount_usd ?? '')}
          />
        ))}
      </div>
    </div>
  );
}

function LendingCard({ p }: { p: LendingPosition }) {
  const hf = p.health_factor;
  const hfNum = Number(hf);
  const hfTone =
    isFinite(hfNum) && hfNum > 0
      ? hfNum >= 2
        ? 'green'
        : hfNum >= 1.2
          ? 'amber'
          : 'amber'
      : 'zinc';
  return (
    <CardShell
      protocol={p.protocol}
      chain={p.chain}
      typeLabel="Lending"
      right={<Value usd={p.total_value_usd} />}
      badges={
        hf != null && hf !== '' ? (
          <Badge tone={hfTone as 'green' | 'amber' | 'zinc'}>
            Health factor {isFinite(hfNum) ? hfNum.toFixed(2) : String(hf)}
          </Badge>
        ) : null
      }
    >
      {hf != null && hf !== '' ? (
        <div className="mb-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
          <span className="text-zinc-500">Health factor (protocol&apos;s own): </span>
          <span className="font-semibold tabular-nums text-black dark:text-zinc-50">
            {isFinite(hfNum) ? hfNum.toFixed(3) : String(hf)}
          </span>
        </div>
      ) : null}
      <LegList title="Supplied" legs={p.supplies} />
      <LegList title="Collateral" legs={p.collateral} />
      <LegList title="Borrowed" legs={p.borrows} />
    </CardShell>
  );
}

function GenericCard({ p }: { p: Position }) {
  const anyP = p as Record<string, unknown>;
  const token = (anyP.token ?? anyP.staked_token ?? anyP.asset) as AlliumToken | undefined;
  const amount = (anyP.amount ?? anyP.balance ?? anyP.token_amount) as string | undefined;
  return (
    <CardShell
      protocol={p.protocol}
      chain={p.chain}
      typeLabel={p.position_type || 'Holding'}
      right={<Value usd={p.total_value_usd} />}
    >
      {token || amount ? (
        <Leg amount={String(amount ?? '')} symbol={sym(token)} usd={p.total_value_usd} />
      ) : null}
    </CardShell>
  );
}

function PositionCard({ p }: { p: Position }) {
  switch (p.position_type) {
    case 'LP':
      return <LpCard p={p as LpPosition} />;
    case 'staked':
      return <StakedCard p={p as StakedPosition} />;
    case 'lending':
      return <LendingCard p={p as LendingPosition} />;
    default:
      return <GenericCard p={p} />;
  }
}

// ── top-level view ──────────────────────────────────────────────────────────
export function DossierView({ dossier }: { dossier: Dossier }) {
  const { address, chains, count, totalValueUsd, items } = dossier;
  const sorted = [...items].sort(
    (a, b) => Number(b.total_value_usd) - Number(a.total_value_usd),
  );
  return (
    <div className="flex w-full flex-col gap-4">
      {/* Header: raw totals, never a score */}
      <div className="rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.10] dark:bg-zinc-950">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Lender view · attested wallet dossier
        </div>
        <div className="mt-1 break-all font-mono text-sm text-zinc-700 dark:text-zinc-300">
          {address}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold tabular-nums text-black dark:text-zinc-50">
              {fmtUsd(totalValueUsd)}
            </div>
            <div className="text-xs text-zinc-500">
              raw sum of position values · {count} position{count === 1 ? '' : 's'}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chains.map((c) => (
              <Badge key={c} tone="blue">
                {c}
              </Badge>
            ))}
          </div>
        </div>
        <p className="mt-3 border-t border-black/[.06] pt-3 text-xs leading-5 text-zinc-500 dark:border-white/[.08]">
          Consented raw data from Allium across the wallet&apos;s attested window. Phora
          discloses history; it computes no score, grade, or rating — a lender does its
          own evaluation.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/[.12] p-8 text-center text-sm text-zinc-500 dark:border-white/[.14]">
          No open positions for this wallet on {chains.join(', ')}.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sorted.map((p) => (
            <PositionCard key={`${p.chain}:${p.position_id}`} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
