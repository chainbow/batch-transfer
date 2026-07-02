import { type Address, getAddress, isAddress, parseUnits } from "viem";

export type TransferDraftRow = {
  id: string;
  address: string;
  amount: string;
};

export type ParsedTransferRow = {
  lineNumber: number;
  address: Address;
  amountText: string;
  amountRaw: bigint;
};

export type ParseError = {
  lineNumber: number;
  line: string;
  message: string;
};

export type ParseResult = {
  rows: ParsedTransferRow[];
  errors: ParseError[];
};

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/u;
const HEADER_RE = /^(address|amount|wallet|owner|地址|数量|金额)$/i;
const PLAIN_AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const GROUPED_AMOUNT_RE = /^(?:0|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/u;

export function parseTransferRows(
  input: string,
  decimals: number,
): ParseResult {
  return validateDraftRows(textToDraftRows(input), decimals);
}

export function textToDraftRows(input: string): TransferDraftRow[] {
  const rows: TransferDraftRow[] = [];

  input.split(/\r?\n/u).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const parts = splitInputLine(line);
    const addressPart = parts.find((part) => ADDRESS_RE.test(part));
    const amountPart = addressPart
      ? parts.find((part) => part !== addressPart)
      : parts[1];

    if (!addressPart && HEADER_RE.test(parts[0] ?? "")) return;

    rows.push({
      id: rowId(),
      address: addressPart ?? parts[0] ?? "",
      amount: amountPart ?? parts[1] ?? "",
    });
  });

  return rows;
}

export function draftRowsToText(rows: readonly TransferDraftRow[]): string {
  return rows
    .filter((row) => row.address.trim() || row.amount.trim())
    .map((row) => `${row.address.trim()},${row.amount.trim()}`)
    .join("\n");
}

export function validateDraftRows(
  draftRows: readonly TransferDraftRow[],
  decimals: number,
): ParseResult {
  const rows: ParsedTransferRow[] = [];
  const errors: ParseError[] = [];

  draftRows.forEach((draftRow, index) => {
    const lineNumber = index + 1;
    const addressPart = draftRow.address.trim();
    const amountPart = draftRow.amount.trim();
    const line = `${addressPart},${amountPart}`;
    if (!addressPart && !amountPart) return;

    if (!addressPart || !isAddress(addressPart)) {
      errors.push({ lineNumber, line, message: "地址格式不正确" });
      return;
    }

    if (!amountPart) {
      errors.push({ lineNumber, line, message: "缺少数量" });
      return;
    }

    let amountRaw: bigint;
    try {
      const normalizedAmountPart = normalizeAmountText(amountPart);
      if (!PLAIN_AMOUNT_RE.test(normalizedAmountPart)) {
        throw new Error("invalid amount");
      }
      const fractional = normalizedAmountPart.split(".")[1] ?? "";
      if (fractional.length > decimals) {
        throw new Error("too many decimals");
      }
      amountRaw = parseUnits(normalizedAmountPart, decimals);
    } catch {
      errors.push({
        lineNumber,
        line,
        message: `数量格式不正确，最多 ${decimals} 位小数`,
      });
      return;
    }

    if (amountRaw <= 0n) {
      errors.push({ lineNumber, line, message: "数量必须大于 0" });
      return;
    }

    const row = {
      lineNumber,
      address: getAddress(addressPart),
      amountText: amountPart,
      amountRaw,
    };
    rows.push(row);
  });

  return { rows, errors };
}

export function totalTransferAmount(
  rows: readonly ParsedTransferRow[],
): bigint {
  return rows.reduce((sum, row) => sum + row.amountRaw, 0n);
}

export function createEmptyDraftRow(): TransferDraftRow {
  return { id: rowId(), address: "", amount: "" };
}

export function normalizePastedMatrix(text: string): string[][] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitInputLine(line));
}

function splitInputLine(line: string): string[] {
  if (line.includes("\t")) {
    return line
      .split("\t")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (isAmountLike(line)) return [line];

  if (line.includes(",")) return splitCommaLine(line);

  return line.split(/ +/u).filter(Boolean);
}

function splitCommaLine(line: string): string[] {
  const cells = line
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (cells.length <= 2) return cells;

  const addressIndex = cells.findIndex((cell) => ADDRESS_RE.test(cell));
  if (addressIndex < 0) return cells;

  const address = cells[addressIndex];
  if (!address) return cells;
  const amount = cells.filter((_, index) => index !== addressIndex).join(",");
  return addressIndex === 0 ? [address, amount] : [amount, address];
}

function normalizeAmountText(value: string): string {
  if (!value.includes(",")) return value;
  if (!GROUPED_AMOUNT_RE.test(value)) throw new Error("invalid grouping");
  return value.replaceAll(",", "");
}

function isAmountLike(value: string): boolean {
  return PLAIN_AMOUNT_RE.test(value) || GROUPED_AMOUNT_RE.test(value);
}

function rowId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
