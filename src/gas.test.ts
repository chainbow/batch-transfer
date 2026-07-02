import { describe, expect, it } from "vitest";

import { buildBatchTransferGasLimit, gasLimitCapForChain } from "./gas";

describe("batch transfer gas limit", () => {
  it("adds a 30% buffer to the estimated gas", () => {
    expect(
      buildBatchTransferGasLimit({ chainId: 8453, estimatedGas: 100_000n }),
    ).toBe(130_000n);
  });

  it("rounds buffered gas up", () => {
    expect(
      buildBatchTransferGasLimit({ chainId: 8453, estimatedGas: 100_001n }),
    ).toBe(130_002n);
  });

  it("uses Base's per-transaction gas cap", () => {
    expect(gasLimitCapForChain(8453)).toBe(25_000_000n);
  });

  it("rejects estimates that would submit above the chain cap", () => {
    expect(() =>
      buildBatchTransferGasLimit({
        chainId: 8453,
        estimatedGas: 140_000_000n,
      }),
    ).toThrow("超过 25000000 上限");
  });
});
