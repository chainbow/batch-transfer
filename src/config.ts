import type { Chain } from "viem";
import { base, bsc, mainnet } from "viem/chains";

export type SupportedToken = {
  symbol: "USDC" | "USDT";
  address: `0x${string}`;
  decimals: number;
};

export type SupportedChain = {
  chain: Chain;
  tokens: SupportedToken[];
  batchTransferContract?: `0x${string}`;
};

export type SupportedChainId = 1 | 8453 | 56;

const envAddress = (key: string): `0x${string}` | undefined => {
  const value = import.meta.env[key];
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(value)) {
    return undefined;
  }
  return value as `0x${string}`;
};

const BATCH_TRANSFER_CONTRACTS = {
  1: "0x890C2026Cc4D78571a8593b1Ccccde9E6b21F6b0",
  8453: "0xadd713eaE9B46Fd02D332433f533309e2f244C50",
  56: "0xc96A0Af8b1B63431c4fEa28a84f4f86a44D4E53F",
} as const;

export const SUPPORTED_CHAINS: SupportedChain[] = [
  {
    chain: mainnet,
    batchTransferContract:
      envAddress("VITE_BATCH_TRANSFER_CONTRACT_1") ??
      BATCH_TRANSFER_CONTRACTS[1],
    tokens: [
      {
        symbol: "USDT",
        address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        decimals: 6,
      },
      {
        symbol: "USDC",
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
      },
    ],
  },
  {
    chain: base,
    batchTransferContract:
      envAddress("VITE_BATCH_TRANSFER_CONTRACT_8453") ??
      BATCH_TRANSFER_CONTRACTS[8453],
    tokens: [
      {
        symbol: "USDC",
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        decimals: 6,
      },
    ],
  },
  {
    chain: bsc,
    batchTransferContract:
      envAddress("VITE_BATCH_TRANSFER_CONTRACT_56") ??
      BATCH_TRANSFER_CONTRACTS[56],
    tokens: [
      {
        symbol: "USDT",
        address: "0x55d398326f99059ff775485246999027b3197955",
        decimals: 18,
      },
    ],
  },
];

export function supportedChainById(
  chainId: number,
): SupportedChain | undefined {
  return SUPPORTED_CHAINS.find((item) => item.chain.id === chainId);
}

export function isSupportedChainId(
  chainId: number,
): chainId is SupportedChainId {
  return chainId === 1 || chainId === 8453 || chainId === 56;
}
