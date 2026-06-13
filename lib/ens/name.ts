import { hexToBytes, type Hex } from 'viem';

/**
 * Decode a DNS-wire-format name (the `name` argument of `resolve(bytes,bytes)`)
 * into its labels, most-specific first. e.g. the wire encoding of
 * `banking.justin.phora.eth` → `['banking','justin','phora','eth']`.
 */
export function decodeDnsName(name: Hex): string[] {
  const bytes = hexToBytes(name);
  const labels: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i];
    if (len === 0) break; // root terminator
    const label = new TextDecoder().decode(bytes.slice(i + 1, i + 1 + len));
    labels.push(label);
    i += 1 + len;
  }
  return labels;
}

export type PhoraName =
  | { level: 'root' }
  | { level: 'username'; username: string }
  | { level: 'usecase'; username: string; useCaseLabel: string; deep: boolean }
  | { level: 'foreign' };

/**
 * Locate a name within the Phora hierarchy under `phora.eth`.
 *  - phora.eth                       → root
 *  - <username>.phora.eth            → username level
 *  - <usecase>.<username>.phora.eth  → use-case (per-attested-wallet) level
 *  - deeper (e.g. agents)            → use-case level with deep=true (leaf is the label)
 */
export function parsePhoraName(labels: string[]): PhoraName {
  const n = labels.length;
  if (n < 2 || labels[n - 1] !== 'eth' || labels[n - 2] !== 'phora') {
    return { level: 'foreign' };
  }
  const sub = labels.slice(0, n - 2); // labels under phora.eth, most-specific first
  if (sub.length === 0) return { level: 'root' };
  if (sub.length === 1) return { level: 'username', username: sub[0].toLowerCase() };
  return {
    level: 'usecase',
    username: sub[sub.length - 1].toLowerCase(),
    useCaseLabel: sub[0].toLowerCase(),
    deep: sub.length > 2,
  };
}
