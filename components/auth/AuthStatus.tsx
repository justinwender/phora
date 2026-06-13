'use client';

import {
  DynamicWidget,
  useDynamicContext,
  useIsLoggedIn,
} from '@dynamic-labs/sdk-react-core';

/**
 * Minimal login surface for spine step 1. Renders Dynamic's widget (the login /
 * account menu) and reflects whether a user is currently authenticated.
 *
 * Scope is intentionally narrow: "is there a logged-in user," nothing about
 * wallets or identity records. The displayed identity here is client-side state
 * only — the server independently verifies the session in a later unit.
 */
export function AuthStatus() {
  const isLoggedIn = useIsLoggedIn();
  const { user } = useDynamicContext();

  const label = user?.email ?? user?.userId ?? 'unknown';

  return (
    <div className="flex flex-col items-center gap-4 sm:items-start">
      <DynamicWidget />
      <p
        className="text-sm text-zinc-600 dark:text-zinc-400"
        data-testid="auth-status"
      >
        {isLoggedIn ? (
          <>
            Signed in (client state):{' '}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {label}
            </span>
          </>
        ) : (
          'Not signed in'
        )}
      </p>
    </div>
  );
}
