import type { Address } from "viem";

export const ETHEREUM_MAINNET_USDT_ADDRESS =
  "0xdac17f958d2ee523a2206206994597c13d831ec7" as const;

type Erc20ApprovalPlanInput = {
  chainId: number;
  tokenAddress: Address;
  allowance: bigint;
  required: bigint;
};

type Erc20ApprovalPlan = {
  amounts: bigint[];
  requiresReset: boolean;
};

export function getErc20ApprovalPlan({
  chainId,
  tokenAddress,
  allowance,
  required,
}: Erc20ApprovalPlanInput): Erc20ApprovalPlan {
  if (allowance >= required) {
    return { amounts: [], requiresReset: false };
  }

  const requiresReset =
    chainId === 1 &&
    tokenAddress.toLowerCase() === ETHEREUM_MAINNET_USDT_ADDRESS &&
    allowance > 0n;

  return {
    amounts: requiresReset ? [0n, required] : [required],
    requiresReset,
  };
}
