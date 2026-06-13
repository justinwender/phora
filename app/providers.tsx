'use client';

import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

/**
 * App-wide client providers. Step 1 of the spine wires Dynamic auth only —
 * this establishes "is there a logged-in user." Wallet linking, the identity
 * registry, ENS, and Allium are deliberately NOT wired here; they come later.
 *
 * EthereumWalletConnectors is included so Dynamic's login flow can offer wallet
 * sign-in, but no wallet logic is read or acted on at this step.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;

  if (!environmentId) {
    throw new Error(
      'NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set. Add it to .env.local.',
    );
  }

  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
