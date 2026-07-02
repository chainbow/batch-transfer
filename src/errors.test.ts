import { describe, expect, it } from "vitest";

import { formatBatchTransferError } from "./errors";

describe("formatBatchTransferError", () => {
  it("maps wallet duplicate submit errors to operator-facing copy", () => {
    expect(
      formatBatchTransferError(
        new Error("[ethSendTransaction] duplicate call detected, ignored"),
      ),
    ).toBe("钱包已忽略重复提交，请等待当前钱包弹窗或交易完成");
  });

  it("keeps the original message for other errors", () => {
    expect(formatBatchTransferError(new Error("RPC failed"))).toBe(
      "RPC failed",
    );
  });
});
