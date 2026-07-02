import { describe, expect, it } from "vitest";

import {
  draftRowsToText,
  normalizePastedMatrix,
  parseTransferRows,
  textToDraftRows,
  totalTransferAmount,
  validateDraftRows,
} from "./parser";

describe("parseTransferRows", () => {
  it("parses comma, tab, and space separated rows", () => {
    const result = parseTransferRows(
      [
        "address,amount",
        "0x0000000000000000000000000000000000000001,12.34",
        "0x0000000000000000000000000000000000000002\t5",
        "0x0000000000000000000000000000000000000003 0.000001",
      ].join("\n"),
      6,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(totalTransferAmount(result.rows)).toBe(17_340_001n);
  });

  it("keeps duplicate addresses as separate transfer rows", () => {
    const result = parseTransferRows(
      [
        "0x0000000000000000000000000000000000000001,1",
        "0x0000000000000000000000000000000000000001,2",
      ].join("\n"),
      6,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.amountRaw)).toEqual([
      1_000_000n,
      2_000_000n,
    ]);
  });

  it("parses grouped thousands amounts without truncating", () => {
    const result = parseTransferRows(
      [
        "0x0000000000000000000000000000000000000001\t1,000.50",
        "0x0000000000000000000000000000000000000002,2,500.25",
      ].join("\n"),
      6,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.amountRaw)).toEqual([
      1_000_500_000n,
      2_500_250_000n,
    ]);
  });

  it("rejects invalid grouped amount text", () => {
    const result = parseTransferRows(
      "0x0000000000000000000000000000000000000001,10,00",
      6,
    );

    expect(result.rows).toHaveLength(0);
    expect(result.errors.map((error) => error.message)).toEqual([
      "数量格式不正确，最多 6 位小数",
    ]);
  });

  it("rejects invalid mixed-case checksum addresses", () => {
    const result = parseTransferRows(
      "0x52908400098527886E0F7030069857D2E4169ee7,1",
      6,
    );

    expect(result.rows).toHaveLength(0);
    expect(result.errors.map((error) => error.message)).toEqual([
      "地址格式不正确",
    ]);
  });

  it("validates editable draft rows", () => {
    const result = validateDraftRows(
      [
        {
          id: "a",
          address: "0x0000000000000000000000000000000000000001",
          amount: "1.5",
        },
        { id: "empty", address: "", amount: "" },
      ],
      6,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amountRaw).toBe(1_500_000n);
  });

  it("converts text to editable rows and back to normalized csv text", () => {
    const rows = textToDraftRows(
      [
        "address,amount",
        "0x0000000000000000000000000000000000000001\t1",
        "0x0000000000000000000000000000000000000002,2",
        "bad-address,3",
      ].join("\n"),
    );

    expect(rows.map((row) => [row.address, row.amount])).toEqual([
      ["0x0000000000000000000000000000000000000001", "1"],
      ["0x0000000000000000000000000000000000000002", "2"],
      ["bad-address", "3"],
    ]);
    expect(draftRowsToText(rows)).toBe(
      [
        "0x0000000000000000000000000000000000000001,1",
        "0x0000000000000000000000000000000000000002,2",
        "bad-address,3",
      ].join("\n"),
    );
  });

  it("normalizes pasted excel matrices", () => {
    expect(normalizePastedMatrix("0x1\t1,000.50\n0x2\t2")).toEqual([
      ["0x1", "1,000.50"],
      ["0x2", "2"],
    ]);
    expect(normalizePastedMatrix("1,000\n2,000\n3")).toEqual([
      ["1,000"],
      ["2,000"],
      ["3"],
    ]);
  });

  it("reports invalid rows", () => {
    const result = parseTransferRows(
      [
        "bad,1",
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002,-1",
        "0x0000000000000000000000000000000000000003,0.0000001",
      ].join("\n"),
      6,
    );

    expect(result.rows).toHaveLength(0);
    expect(result.errors.map((error) => error.message)).toEqual([
      "地址格式不正确",
      "缺少数量",
      "数量格式不正确，最多 6 位小数",
      "数量格式不正确，最多 6 位小数",
    ]);
  });
});
