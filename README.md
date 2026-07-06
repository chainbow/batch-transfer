# Batch Transfer Tool

Standalone Cloudflare Pages app for sending USDT/USDC to many recipients from the connected wallet.

## Build

```bash
pnpm install
pnpm dev      # local dev server
pnpm build    # production build -> dist/
```

Cloudflare Pages:

- Root directory: repository root
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Build output directory: `dist`

## Contract

First-time setup installs the Solidity dependencies via Foundry's Soldeer
package manager (no `git submodule` needed):

```bash
cd contracts
forge soldeer install forge-std~1.9.7
forge soldeer install @openzeppelin-contracts~5.6.1
forge build
```

Deploy the stateless batch sender once per chain:

```bash
PRIVATE_KEY=0x... forge script script/DeployBatchTokenTransfer.s.sol:DeployBatchTokenTransfer \
  --rpc-url "$ETHEREUM_RPC_URL" \
  --broadcast \
  --verify
```

Point `--rpc-url` at `$BASE_RPC_URL` or `$BSC_RPC_URL` to redeploy the same
chain-agnostic contract on Base or BNB Smart Chain.

After deployment, configure the Pages environment variable for each chain:

- `VITE_BATCH_TRANSFER_CONTRACT_1`
- `VITE_BATCH_TRANSFER_CONTRACT_8453`
- `VITE_BATCH_TRANSFER_CONTRACT_56`

Optional browser RPC overrides:

- `VITE_ETHEREUM_RPC_URL`
- `VITE_BASE_RPC_URL`
- `VITE_BSC_RPC_URL`

The app also ships with public CORS-safe fallback RPC URLs. Do not rely on
viem's default Ethereum RPC in production; `https://eth.merkle.io` blocks the
`https://batch.mydapp.io` browser origin.

Current deployments:

- Ethereum mainnet: `0x890C2026Cc4D78571a8593b1Ccccde9E6b21F6b0`
  - tx: `0x5cabb3b14ac2dc4247ca63a5fe985d8f04c6c469cc03dd25eb4e42ede0a1b7a3`
- Base mainnet: `0xadd713eaE9B46Fd02D332433f533309e2f244C50`
  - tx: `0xd39f88319a3258d33ddc20bd0fe7ffb31fdb97ec629ba1c6e494bc0d831840e5`
- BNB Smart Chain: `0xc96A0Af8b1B63431c4fEa28a84f4f86a44D4E53F`
  - tx: `0x866d2c6d322f584b697089ab6ffbde2fc83e61fd039e568e9f2d5733ae4a62ed`
  - block: `108390388`
  - BscScan (source verified, Sourcify full match):
    <https://bscscan.com/address/0xc96A0Af8b1B63431c4fEa28a84f4f86a44D4E53F#code>

The app supports:

| Chain            | Tokens | Contract    |
| ---------------- | ------ | ----------- |
| Ethereum mainnet | USDT, USDC | deployed |
| Base mainnet     | USDC   | deployed    |
| BNB Smart Chain  | USDT   | deployed    |

## Input Format

Paste one recipient per line:

```csv
address,amount
0xc72662dcc4afeded54b30695ae2de80c4823dca3,2.34
0x0000000000000000000000000000000000000001,5
```

Commas, tabs, and spaces are accepted as separators. Duplicate addresses are merged before sending.
