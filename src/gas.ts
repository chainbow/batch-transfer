export const BATCH_TRANSFER_GAS_LIMIT_CAP_BY_CHAIN: Record<number, bigint> = {
  1: 30_000_000n,
  8453: 25_000_000n,
  56: 30_000_000n,
};

export const BATCH_TRANSFER_GAS_BUFFER_BPS = 13_000n;

type BatchTransferGasLimitInput = {
  chainId: number;
  estimatedGas: bigint;
};

export function gasLimitCapForChain(chainId: number): bigint {
  return BATCH_TRANSFER_GAS_LIMIT_CAP_BY_CHAIN[chainId] ?? 25_000_000n;
}

export function buildBatchTransferGasLimit({
  chainId,
  estimatedGas,
}: BatchTransferGasLimitInput): bigint {
  const cap = gasLimitCapForChain(chainId);
  const buffered =
    (estimatedGas * BATCH_TRANSFER_GAS_BUFFER_BPS + 9_999n) / 10_000n;

  if (buffered > cap) {
    throw new Error(
      `Gas 估算 ${estimatedGas.toString()}，加缓冲后超过 ${cap.toString()} 上限。请拆成更小批次后重试。`,
    );
  }

  return buffered;
}
