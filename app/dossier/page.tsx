'use client';

import { useCallback, useEffect, useState } from 'react';
import { DossierView, type Dossier } from '@/components/dossier/DossierView';

/**
 * Lender persona view of a resolved/attested wallet: the Allium behavioral dossier,
 * parameterized by (address, chain). In the full flow a lender reaches this after the
 * identity owner grants access to an attested wallet; here it is address-parameterized
 * directly. Renders raw Allium positions only — no Phora score.
 */

interface DemoWallet {
  label: string;
  note: string;
  address: string;
  chain: string;
}

// Verified to render real data (see scripts/allium-probe.mjs).
const DEMO_WALLETS: DemoWallet[] = [
  {
    label: 'Rich footprint',
    note: 'Uniswap V3/V4 LPs + Lido staking · Ethereum + Base',
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    chain: 'ethereum,base',
  },
  {
    label: 'Consent-story wallet',
    note: 'Lido stETH · Ethereum',
    address: '0xea0B8332c3438BeB43c13cB04516557ff4541bE8',
    chain: 'ethereum',
  },
];

export default function DossierPage() {
  const [address, setAddress] = useState(DEMO_WALLETS[0].address);
  const [chain, setChain] = useState(DEMO_WALLETS[0].chain);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (addr: string, chains: string) => {
    setLoading(true);
    setError(null);
    setDossier(null);
    try {
      const res = await fetch(
        `/api/dossier?address=${encodeURIComponent(addr)}&chain=${encodeURIComponent(chains)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setDossier(json as Dossier);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the first demo wallet on mount.
  useEffect(() => {
    void load(DEMO_WALLETS[0].address, DEMO_WALLETS[0].chain);
  }, [load]);

  function selectDemo(w: DemoWallet) {
    setAddress(w.address);
    setChain(w.chain);
    void load(w.address, w.chain);
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Wallet dossier
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            What a lender sees once an identity owner consents to disclosing an attested
            wallet: its live behavioral profile from Allium. Raw data only.
          </p>
        </header>

        {/* Demo wallets */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Demo wallets
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DEMO_WALLETS.map((w) => {
              const active = w.address === address && w.chain === chain;
              return (
                <button
                  key={w.address + w.chain}
                  onClick={() => selectDemo(w)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40'
                      : 'border-black/[.08] bg-white hover:bg-zinc-50 dark:border-white/[.10] dark:bg-zinc-950 dark:hover:bg-zinc-900'
                  }`}
                >
                  <div className="text-sm font-semibold text-black dark:text-zinc-50">
                    {w.label}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">{w.note}</div>
                  <div className="mt-1 truncate font-mono text-xs text-zinc-400">
                    {w.address}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom address */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(address, chain);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x… wallet address"
            className="flex-1 rounded-lg border border-black/[.12] bg-white px-3 py-2 font-mono text-sm text-black outline-none focus:border-blue-400 dark:border-white/[.14] dark:bg-zinc-950 dark:text-zinc-50"
          />
          <input
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            placeholder="ethereum,base"
            className="w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-sm text-black outline-none focus:border-blue-400 dark:border-white/[.14] dark:bg-zinc-950 dark:text-zinc-50 sm:w-44"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {loading ? 'Loading…' : 'Resolve'}
          </button>
        </form>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {loading && !dossier ? (
          <div className="rounded-xl border border-dashed border-black/[.12] p-8 text-center text-sm text-zinc-500 dark:border-white/[.14]">
            Querying Allium…
          </div>
        ) : null}

        {dossier ? <DossierView dossier={dossier} /> : null}
      </main>
    </div>
  );
}
