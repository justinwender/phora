'use client';

import { useState } from 'react';
import { getAuthToken, useIsLoggedIn } from '@dynamic-labs/sdk-react-core';

/**
 * Demonstrates that the server independently verifies the session. Sends the
 * Dynamic auth token to GET /api/me, which validates it against Dynamic's JWKS
 * and returns the server-derived user id. The id shown here is established by
 * the server, not asserted by the client.
 */
export function ServerSessionCheck() {
  const isLoggedIn = useIsLoggedIn();
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    setResult(null);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/me', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json();
      setResult(`HTTP ${res.status} — ${JSON.stringify(body)}`);
    } catch (err) {
      setResult(`request failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  if (!isLoggedIn) return null;

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <button
        type="button"
        onClick={check}
        disabled={loading}
        className="rounded-full border border-black/[.12] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.18] dark:hover:bg-white/[.06]"
      >
        {loading ? 'Verifying…' : 'Verify session server-side'}
      </button>
      {result && (
        <p
          data-testid="server-session"
          className="font-mono text-sm text-zinc-700 dark:text-zinc-300"
        >
          {result}
        </p>
      )}
    </div>
  );
}
