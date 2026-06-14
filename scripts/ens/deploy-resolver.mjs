// Deploy PhoraOffchainResolver to Sepolia from the dev wallet, configured with the
// gateway URL + signer. Saves the address to .env.local (PHORA_RESOLVER_ADDRESS).
import { createWalletClient, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, appendFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
const get = (k) => { const l = env.split('\n').find((x) => x.startsWith(k + '=')); return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : ''; };
const fix = (k) => { let v = get(k); return v && !v.startsWith('0x') ? '0x' + v : v; };

const account = privateKeyToAccount(fix('DEV_WALLET_PRIVATE_KEY'));
const signerAddr = privateKeyToAccount(fix('ENS_GATEWAY_SIGNER_KEY')).address;
const GATEWAY_URL = get('PHORA_GATEWAY_URL') || 'http://localhost:3000/api/ens/gateway';

const transport = http(get('SEPOLIA_RPC_URL'));
const wallet = createWalletClient({ account, chain: sepolia, transport });
const pub = createPublicClient({ chain: sepolia, transport });
const artifact = JSON.parse(readFileSync('artifacts/PhoraOffchainResolver.json', 'utf8'));

console.log(`deploying PhoraOffchainResolver(url=${GATEWAY_URL}, signer=${signerAddr}) from ${account.address}`);
const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [GATEWAY_URL, signerAddr] });
console.log('deploy tx:', hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log('resolver deployed at:', receipt.contractAddress, '| status:', receipt.status);
appendFileSync('.env.local', `\nPHORA_RESOLVER_ADDRESS=${receipt.contractAddress}\nPHORA_GATEWAY_URL=${GATEWAY_URL}\n`);
console.log('saved PHORA_RESOLVER_ADDRESS + PHORA_GATEWAY_URL to .env.local');
