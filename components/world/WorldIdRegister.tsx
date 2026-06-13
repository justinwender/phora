'use client';

import { useState } from 'react';
import {
  IDKitRequestWidget,
  proofOfHuman,
  type RpContext,
} from '@worldcoin/idkit';

const WORLD_ACTION = 'register-identity';
const APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID as `app_${string}`;

type Status = 'idle' | 'loading' | 'awaiting' | 'verifying' | 'success' | 'error';

/**
 * Spine step 2 — World ID 4.0 registration (verify sub-unit).
 *
 * Flow: fetch a fresh RP-signature context from /api/world/rp-context (Unit 1),
 * open the IDKit proof-of-human request for `register-identity`, then forward the
 * resulting 4.0 proof to /api/world/verify, which verifies it against our RP and
 * returns the nullifier. No persistence yet — the nullifier is only displayed.
 */
export function WorldIdRegister() {
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = status === 'loading' || status === 'awaiting' || status === 'verifying';

  async function start() {
    setError(null);
    setNullifier(null);
    setStatus('loading');
    try {
      const ctx = await fetch('/api/world/rp-context').then((r) => r.json());
      // Map our route's camelCase response into IDKit's snake_case RpContext.
      setRpContext({
        rp_id: ctx.rpId,
        nonce: ctx.nonce,
        created_at: ctx.createdAt,
        expires_at: ctx.expiresAt,
        signature: ctx.sig,
      });
      setStatus('awaiting');
      setOpen(true);
    } catch (e) {
      setError(`Could not fetch RP context: ${String(e)}`);
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:items-start">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {status === 'loading' ? 'Preparing…' : 'Register with World ID'}
      </button>

      {rpContext && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={APP_ID}
          action={WORLD_ACTION}
          rp_context={rpContext}
          preset={proofOfHuman()}
          allow_legacy_proofs={false}
          environment="production"
          handleVerify={async (result) => {
            setStatus('verifying');
            const res = await fetch('/api/world/verify', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(result),
            });
            const data = await res.json();
            if (!res.ok) {
              setError(JSON.stringify(data));
              setStatus('error');
              throw new Error('server verification failed'); // abort onSuccess
            }
            setNullifier(data.nullifier);
            setStatus('success');
          }}
          onSuccess={() => {
            // Nullifier was captured in handleVerify; nothing else to do here.
          }}
          onError={(errorCode) => {
            setError(`World ID error: ${String(errorCode)}`);
            setStatus('error');
          }}
        />
      )}

      {status === 'awaiting' && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Scan the QR with World App to prove you&apos;re a unique human…
        </p>
      )}
      {status === 'verifying' && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Verifying proof server-side…</p>
      )}
      {status === 'success' && nullifier && (
        <p
          data-testid="world-nullifier"
          className="max-w-md break-all font-mono text-sm text-zinc-700 dark:text-zinc-300"
        >
          Verified unique human. Nullifier: <span className="font-semibold">{nullifier}</span>
        </p>
      )}
      {status === 'error' && error && (
        <p
          data-testid="world-error"
          className="max-w-md break-all font-mono text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
