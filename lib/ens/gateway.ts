import {
  decodeFunctionData,
  encodeAbiParameters,
  encodePacked,
  keccak256,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { sign } from 'viem/accounts';
import { CcipReadRouter } from '@ensdomains/ccip-read-router';
import { GATEWAY_TTL_SECONDS, getGatewaySignerKey } from './config';
import { decodeDnsName, parsePhoraName } from './name';
import { resolvePhoraName } from './resolve';

// The inner resolver queries we answer. (text/contenthash arrive in unit 3.)
const QUERY_ABI = parseAbi([
  'function addr(bytes32 node) view returns (address)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
  'function text(bytes32 node, string key) view returns (string)',
]);

const ETH_COIN_TYPE = BigInt(60);

/** Compute the ABI-encoded answer for the inner resolver query against the registry. */
async function answerQuery(name: Hex, data: Hex): Promise<Hex> {
  const parsed = parsePhoraName(decodeDnsName(name));

  let decoded;
  try {
    decoded = decodeFunctionData({ abi: QUERY_ABI, data });
  } catch {
    return '0x';
  }

  if (decoded.functionName === 'addr') {
    const resolution = await resolvePhoraName(parsed);
    const address: Address = resolution?.address ?? zeroAddress;
    if (decoded.args.length === 1) {
      // addr(bytes32) -> address
      return encodeAbiParameters([{ type: 'address' }], [address]);
    }
    // addr(bytes32, uint256 coinType) -> bytes
    const coinType = decoded.args[1] as bigint;
    const value: Hex =
      coinType === ETH_COIN_TYPE && address !== zeroAddress ? address : '0x';
    return encodeAbiParameters([{ type: 'bytes' }], [value]);
  }

  // Unsupported here (text records arrive in unit 3): empty answer.
  return '0x';
}

/**
 * The Phora offchain resolver gateway (EIP-3668 CCIP-Read + ENSIP-10 wildcard).
 * It answers `resolve(name, data)` from the live registry and signs every answer
 * with the gateway key, exactly as `SignatureVerifier.makeSignatureHash` expects:
 *   keccak256(0x1900 ‖ resolver ‖ uint64(expires) ‖ keccak256(request) ‖ keccak256(result))
 * The deployed OffchainResolver recovers the signer and checks it is trusted.
 */
export const phoraGateway = CcipReadRouter();

phoraGateway.add({
  type: 'function resolve(bytes name, bytes data) view returns (bytes result, uint64 expires, bytes sig)',
  handle: async ([name, data], req) => {
    const result = await answerQuery(name as Hex, data as Hex);
    const expires = BigInt(Math.floor(Date.now() / 1000) + GATEWAY_TTL_SECONDS);
    const sigHash = keccak256(
      encodePacked(
        ['bytes', 'address', 'uint64', 'bytes32', 'bytes32'],
        ['0x1900', req.to, expires, keccak256(req.data), keccak256(result)],
      ),
    );
    const sig = await sign({ hash: sigHash, privateKey: getGatewaySignerKey(), to: 'hex' });
    return [result, expires, sig];
  },
});
