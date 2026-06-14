// Compile contracts/PhoraOffchainResolver.sol → artifacts/PhoraOffchainResolver.json
import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { toFunctionSelector } from 'viem';

const source = readFileSync('contracts/PhoraOffchainResolver.sol', 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'PhoraOffchainResolver.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((e) => e.severity === 'error');
if (errors.length) {
  console.error(errors.map((e) => e.formattedMessage).join('\n'));
  process.exit(1);
}

const c = output.contracts['PhoraOffchainResolver.sol'].PhoraOffchainResolver;
const artifact = { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/PhoraOffchainResolver.json', `${JSON.stringify(artifact, null, 2)}\n`);

console.log('compiled. bytecode bytes:', (artifact.bytecode.length - 2) / 2);
console.log('resolve(bytes,bytes) selector:', toFunctionSelector('function resolve(bytes, bytes)'), '(expect 0x9061b923)');
console.log('ABI functions:', artifact.abi.filter((x) => x.type === 'function').map((x) => x.name).join(', '));
