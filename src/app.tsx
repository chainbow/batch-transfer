import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  erc20Abi,
  formatUnits,
  getAddress,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";
import {
  getBalance,
  getPublicClient,
  readContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";

import { batchTokenTransferAbi } from "./abi";
import { getErc20ApprovalPlan } from "./approval";
import {
  isSupportedChainId,
  SUPPORTED_CHAINS,
  type SupportedToken,
  supportedChainById,
} from "./config";
import { formatBatchTransferError } from "./errors";
import { buildBatchTransferGasLimit } from "./gas";
import {
  createEmptyDraftRow,
  draftRowsToText,
  normalizePastedMatrix,
  type TransferDraftRow,
  textToDraftRows,
  totalTransferAmount,
  validateDraftRows,
} from "./parser";
import { wagmiConfig } from "./wagmi";

type Notice = {
  tone: "info" | "success" | "error" | "warning";
  text: string;
  txHash?: Hash;
  chainId?: number;
};

type RunStage =
  | "idle"
  | "switching"
  | "checking"
  | "approving"
  | "sending"
  | "confirming"
  | "success"
  | "error";

type InputMode = "table" | "text";

const EXAMPLE_INPUT = [
  "0xc72662dcc4afeded54b30695ae2de80c4823dca3,2.34",
  "0x0000000000000000000000000000000000000001,5",
].join("\n");
const MAX_BATCH_SIZE = 200;

const stageText: Record<RunStage, string> = {
  idle: "就绪",
  switching: "切换链",
  checking: "检查余额",
  approving: "授权中",
  sending: "发送中",
  confirming: "确认中",
  success: "完成",
  error: "失败",
};

export function App() {
  const [selectedChainId, setSelectedChainId] = useState(
    SUPPORTED_CHAINS[0]?.chain.id ?? 1,
  );
  const selectedChain =
    supportedChainById(selectedChainId) ?? SUPPORTED_CHAINS[0];
  const [selectedTokenAddress, setSelectedTokenAddress] = useState(
    selectedChain?.tokens[0]?.address ??
      "0x0000000000000000000000000000000000000000",
  );
  const [inputMode, setInputMode] = useState<InputMode>("table");
  const [rawText, setRawText] = useState("");
  const [draftRows, setDraftRows] = useState<TransferDraftRow[]>([
    createEmptyDraftRow(),
  ]);
  const [stage, setStage] = useState<RunStage>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const batchTransferInFlightRef = useRef(false);

  const { address, chainId: walletChainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();

  const token =
    selectedChain?.tokens.find(
      (item) =>
        item.address.toLowerCase() === selectedTokenAddress.toLowerCase(),
    ) ?? selectedChain?.tokens[0];

  const {
    data: walletBalanceRaw,
    isError: walletBalanceError,
    isFetched: walletBalanceFetched,
    isLoading: walletBalanceLoading,
  } = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: isConnected && !!token && !!address },
  });
  const parseResult = useMemo(
    () => validateDraftRows(draftRows, token?.decimals ?? 6),
    [draftRows, token?.decimals],
  );
  const totalRaw = useMemo(
    () => totalTransferAmount(parseResult.rows),
    [parseResult.rows],
  );

  const rowCount = parseResult.rows.length;

  const walletBalanceFmt =
    token && walletBalanceRaw !== undefined
      ? formatUnits(walletBalanceRaw, token.decimals)
      : "";
  const balanceReady =
    isConnected &&
    !!token &&
    walletBalanceFetched &&
    !walletBalanceLoading &&
    !walletBalanceError &&
    walletBalanceRaw !== undefined;
  const balanceShortfall =
    balanceReady && totalRaw > 0n && totalRaw > walletBalanceRaw;
  const duplicateAddressCount = useMemo(
    () => countDuplicateAddresses(parseResult.rows.map((row) => row.address)),
    [parseResult.rows],
  );
  const errorCount = parseResult.errors.length;
  const isBusy =
    stage === "switching" ||
    stage === "checking" ||
    stage === "approving" ||
    stage === "sending" ||
    stage === "confirming";
  const canSubmit =
    !!selectedChain?.batchTransferContract &&
    !!token &&
    isConnected &&
    errorCount === 0 &&
    rowCount > 0 &&
    rowCount <= MAX_BATCH_SIZE &&
    balanceReady &&
    !balanceShortfall &&
    !isBusy;

  function changeChain(chainId: number) {
    const nextChain = supportedChainById(chainId);
    if (!nextChain) return;
    setSelectedChainId(chainId);
    setSelectedTokenAddress(
      nextChain.tokens[0]?.address ?? selectedTokenAddress,
    );
    setNotice(null);
    setReceipt(null);
  }

  function resetRunState() {
    setNotice(null);
    setReceipt(null);
    if (stage === "success" || stage === "error") setStage("idle");
  }

  function applyDraftRows(rows: TransferDraftRow[]) {
    const nextRows = rows.length > 0 ? rows : [createEmptyDraftRow()];
    setDraftRows(nextRows);
    setRawText(draftRowsToText(nextRows));
    resetRunState();
  }

  function applyRawText(value: string) {
    setRawText(value);
    const nextRows = textToDraftRows(value);
    setDraftRows(nextRows.length > 0 ? nextRows : [createEmptyDraftRow()]);
    resetRunState();
  }

  function updateDraftRow(
    rowId: string,
    field: "address" | "amount",
    value: string,
  ) {
    applyDraftRows(
      draftRows.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row,
      ),
    );
  }

  function addDraftRow() {
    applyDraftRows([...draftRows, createEmptyDraftRow()]);
  }

  function removeDraftRow(rowId: string) {
    applyDraftRows(draftRows.filter((row) => row.id !== rowId));
  }

  function pasteIntoDraftRows(
    event: React.ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: "address" | "amount",
  ) {
    const matrix = normalizePastedMatrix(event.clipboardData.getData("text"));
    if (matrix.length === 0) return;

    event.preventDefault();
    const nextRows = [...draftRows];
    const hasTwoColumns = matrix.some((row) => row.length >= 2);

    matrix.forEach((cells, offset) => {
      const targetIndex = rowIndex + offset;
      while (nextRows.length <= targetIndex)
        nextRows.push(createEmptyDraftRow());
      const current = nextRows[targetIndex] ?? createEmptyDraftRow();

      if (hasTwoColumns) {
        nextRows[targetIndex] = {
          ...current,
          address: cells[0] ?? "",
          amount: cells[1] ?? "",
        };
        return;
      }

      nextRows[targetIndex] = {
        ...current,
        [field]: cells[0] ?? "",
      };
    });

    applyDraftRows(nextRows);
  }

  async function connectWallet() {
    const connector = connectors[0];
    if (!connector) {
      setNotice({ tone: "error", text: "没有检测到浏览器钱包" });
      return;
    }
    await connectAsync({ connector });
  }

  async function runBatchTransfer() {
    if (batchTransferInFlightRef.current) {
      setNotice({
        tone: "warning",
        text: "已有批量转账处理中，请等待当前钱包弹窗或交易完成",
      });
      return;
    }
    if (
      !selectedChain ||
      !token ||
      !address ||
      !selectedChain.batchTransferContract
    ) {
      return;
    }
    const activeChainId = selectedChain.chain.id;
    if (!isSupportedChainId(activeChainId)) {
      setNotice({ tone: "error", text: "不支持的链" });
      return;
    }
    if (errorCount > 0) {
      setNotice({ tone: "error", text: "请先修正输入错误" });
      return;
    }
    if (rowCount === 0) {
      setNotice({ tone: "error", text: "请至少输入一个收款地址" });
      return;
    }
    if (rowCount > MAX_BATCH_SIZE) {
      setNotice({
        tone: "error",
        text: `单次最多发送 ${MAX_BATCH_SIZE} 个地址`,
      });
      return;
    }
    if (totalRaw <= 0n) {
      setNotice({ tone: "error", text: "发送总额必须大于 0" });
      return;
    }
    if (!balanceReady) {
      setNotice({ tone: "error", text: "钱包余额还没有读取成功，请稍后重试" });
      return;
    }
    if (balanceShortfall) {
      setNotice({
        tone: "error",
        text: `钱包余额不足：需要 ${formatToken(totalRaw, token)} ${token.symbol}，当前 ${formatToken(walletBalanceRaw, token)} ${token.symbol}`,
      });
      return;
    }
    if (
      !window.confirm(
        `确认发送 ${rowCount} 个地址，总额 ${formatToken(totalRaw, token)} ${token.symbol}？`,
      )
    ) {
      return;
    }

    setNotice(null);
    setReceipt(null);
    setStage("switching");
    batchTransferInFlightRef.current = true;

    try {
      if (walletChainId !== activeChainId) {
        await switchChain(wagmiConfig, { chainId: activeChainId });
      }

      setStage("checking");
      const [tokenBalance, nativeBalance, allowance] = await Promise.all([
        readContract(wagmiConfig, {
          chainId: activeChainId,
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        getBalance(wagmiConfig, {
          chainId: activeChainId,
          address,
        }),
        readContract(wagmiConfig, {
          chainId: activeChainId,
          address: token.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, selectedChain.batchTransferContract],
        }),
      ]);

      if (tokenBalance < totalRaw) {
        throw new Error(
          `钱包余额不足：需要 ${formatToken(totalRaw, token)} ${token.symbol}，当前 ${formatToken(tokenBalance, token)} ${token.symbol}`,
        );
      }
      if (nativeBalance.value === 0n) {
        throw new Error(
          `钱包没有 ${selectedChain.chain.nativeCurrency.symbol} 支付 gas`,
        );
      }

      const approvalPlan = getErc20ApprovalPlan({
        chainId: activeChainId,
        tokenAddress: token.address,
        allowance,
        required: totalRaw,
      });

      if (approvalPlan.amounts.length > 0) {
        setStage("approving");
        for (const approvalAmount of approvalPlan.amounts) {
          const approvalHash = await writeContract(wagmiConfig, {
            chainId: activeChainId,
            address: token.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [selectedChain.batchTransferContract, approvalAmount],
          });
          const approvalReceipt = await waitForTransactionReceipt(wagmiConfig, {
            chainId: activeChainId,
            hash: approvalHash,
          });
          if (approvalReceipt.status !== "success") {
            throw new Error("Token 授权交易失败");
          }
        }
      }

      setStage("sending");
      const recipients = parseResult.rows.map((row) => row.address);
      const amounts = parseResult.rows.map((row) => row.amountRaw);
      const publicClient = getPublicClient(wagmiConfig, {
        chainId: activeChainId,
      });
      if (!publicClient) {
        throw new Error("无法连接当前链的 RPC");
      }
      const estimatedGas = await publicClient.estimateContractGas({
        account: address,
        address: selectedChain.batchTransferContract,
        abi: batchTokenTransferAbi,
        functionName: "batchTransferERC20",
        args: [token.address, recipients, amounts],
      });
      const gas = buildBatchTransferGasLimit({
        chainId: activeChainId,
        estimatedGas,
      });
      const txHash = await writeContract(wagmiConfig, {
        chainId: activeChainId,
        address: selectedChain.batchTransferContract,
        abi: batchTokenTransferAbi,
        functionName: "batchTransferERC20",
        args: [token.address, recipients, amounts],
        gas,
      });

      setStage("confirming");
      setNotice({
        tone: "info",
        text: "批量转账已提交，等待链上确认",
        txHash,
        chainId: activeChainId,
      });
      const txReceipt = await waitForTransactionReceipt(wagmiConfig, {
        chainId: activeChainId,
        hash: txHash,
      });
      if (txReceipt.status !== "success") {
        throw new Error("批量转账交易回滚");
      }

      setReceipt(txReceipt);
      setStage("success");
      setNotice({
        tone: "success",
        text: "批量转账已完成",
        txHash,
        chainId: activeChainId,
      });
    } catch (error) {
      setStage("error");
      setNotice({
        tone: "error",
        text: formatBatchTransferError(error),
      });
    } finally {
      batchTransferInFlightRef.current = false;
    }
  }

  const errorByLine = useMemo(() => {
    const map = new Map<number, string>();
    for (const err of parseResult.errors) map.set(err.lineNumber, err.message);
    return map;
  }, [parseResult.errors]);

  return (
    <main className="app">
      <div className="app-container">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-left">
            <h1 className="toolbar-title">Batch Token Transfer</h1>
            <div className="toolbar-selects">
              <select
                className="select-sm"
                value={selectedChainId}
                onChange={(event) => changeChain(Number(event.target.value))}
              >
                {SUPPORTED_CHAINS.map((item) => (
                  <option key={item.chain.id} value={item.chain.id}>
                    {item.chain.name}
                  </option>
                ))}
              </select>
              <select
                className="select-sm"
                value={selectedTokenAddress}
                onChange={(event) =>
                  setSelectedTokenAddress(event.target.value as `0x${string}`)
                }
              >
                {(selectedChain?.tokens ?? []).map((item) => (
                  <option key={item.address} value={item.address}>
                    {item.symbol}
                  </option>
                ))}
              </select>
            </div>
            {selectedChain?.batchTransferContract ? (
              <a
                className="toolbar-contract"
                href={addressUrl(
                  selectedChain.chain.id,
                  selectedChain.batchTransferContract,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <span className="font-mono text-xs">
                  {shortAddress(
                    getAddress(selectedChain.batchTransferContract),
                  )}
                </span>
                <ExternalLink size={11} />
              </a>
            ) : (
              <span className="contract-missing">未部署</span>
            )}
          </div>

          <div className="wallet-box">
            <Wallet size={18} />
            {isConnected && address ? (
              <>
                <span className="font-mono text-xs">
                  {shortAddress(address)}
                </span>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => disconnect()}
                >
                  断开
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-link"
                disabled={connectPending}
                onClick={connectWallet}
              >
                {connectPending ? "连接中" : "连接钱包"}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${inputMode === "table" ? "tab-active" : ""}`}
            type="button"
            onClick={() => setInputMode("table")}
          >
            表格输入
          </button>
          <button
            className={`tab ${inputMode === "text" ? "tab-active" : ""}`}
            type="button"
            onClick={() => setInputMode("text")}
          >
            文本输入
          </button>
        </div>

        {/* Input area */}
        <div className="input-area">
          {inputMode === "table" ? (
            <div className="editable-table-wrap">
              <table className="editable-table">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th>地址</th>
                    <th>数量</th>
                    <th className="col-act" />
                  </tr>
                </thead>
                <tbody>
                  {draftRows.map((row, index) => {
                    const errorMsg = errorByLine.get(index + 1);
                    return (
                      <tr
                        key={row.id}
                        className={errorMsg ? "row-err" : undefined}
                      >
                        <td className="col-num">{index + 1}</td>
                        <td>
                          <input
                            aria-label={`address-${index + 1}`}
                            className="cell font-mono"
                            value={row.address}
                            onChange={(event) =>
                              updateDraftRow(
                                row.id,
                                "address",
                                event.target.value,
                              )
                            }
                            onPaste={(event) =>
                              pasteIntoDraftRows(event, index, "address")
                            }
                            placeholder="0x..."
                            spellCheck={false}
                          />
                          {errorMsg ? (
                            <div className="cell-err">{errorMsg}</div>
                          ) : null}
                        </td>
                        <td>
                          <input
                            aria-label={`amount-${index + 1}`}
                            className="cell"
                            value={row.amount}
                            onChange={(event) =>
                              updateDraftRow(
                                row.id,
                                "amount",
                                event.target.value,
                              )
                            }
                            onPaste={(event) =>
                              pasteIntoDraftRows(event, index, "amount")
                            }
                            placeholder="0.00"
                            spellCheck={false}
                          />
                        </td>
                        <td className="col-act">
                          <button
                            className="icon-btn"
                            type="button"
                            aria-label={`remove-${index + 1}`}
                            onClick={() => removeDraftRow(row.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="table-foot">
                <button className="add-btn" type="button" onClick={addDraftRow}>
                  <Plus size={14} />
                  添加行
                </button>
                <span className="table-hint">
                  可从 Excel 粘贴一列地址、一列数量，或两列一起粘贴
                </span>
              </div>
            </div>
          ) : (
            <textarea
              className="text-input"
              value={rawText}
              onChange={(event) => applyRawText(event.target.value)}
              placeholder={EXAMPLE_INPUT}
              spellCheck={false}
            />
          )}
        </div>

        {/* Error summary */}
        {errorCount > 0 && (
          <div className="err-bar">
            <AlertCircle size={15} />
            <span>共 {errorCount} 行存在错误，已标红显示</span>
          </div>
        )}
        {duplicateAddressCount > 0 && errorCount === 0 && (
          <div className="err-bar warning">
            <AlertCircle size={15} />
            <span>
              有 {duplicateAddressCount}{" "}
              个重复地址，链上会按表格中的每一行分别发送
            </span>
          </div>
        )}

        {notice && (
          <div className={`notice ${notice.tone}`}>
            {notice.tone === "success" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{notice.text}</span>
            {notice.txHash && notice.chainId ? (
              <a
                href={txUrl(notice.chainId, notice.txHash)}
                target="_blank"
                rel="noreferrer"
              >
                查看交易
                <ExternalLink size={13} />
              </a>
            ) : null}
          </div>
        )}

        {/* Send bar */}
        <div className="send-bar">
          <div className="send-summary">
            <div className="send-stat">
              <span className="send-stat-label">{rowCount}</span>
              <span className="send-stat-hint">地址</span>
            </div>
            <div className="send-stat">
              <span className="send-stat-label">
                {token ? formatToken(totalRaw, token) : "0"}
              </span>
              <span className="send-stat-hint">{token?.symbol}</span>
            </div>
            {isConnected ? (
              <div
                className={
                  balanceShortfall ? "send-stat send-stat-err" : "send-stat"
                }
              >
                <span className="send-stat-label">
                  {walletBalanceLabel({
                    balanceFmt: walletBalanceFmt,
                    isError: walletBalanceError,
                    isLoading: walletBalanceLoading,
                    isReady: balanceReady,
                  })}
                </span>
                <span className="send-stat-hint">{token?.symbol} 钱包</span>
                {balanceShortfall ? (
                  <span className="send-stat-warn">余额不足</span>
                ) : null}
              </div>
            ) : null}
            <div className="send-stage">{stageText[stage]}</div>
          </div>
          <button
            className="send-btn"
            disabled={!canSubmit}
            type="button"
            onClick={() => void runBatchTransfer()}
          >
            {isBusy ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Send size={18} />
            )}
            {selectedChain?.batchTransferContract
              ? "发送批量转账"
              : "合约未部署"}
          </button>
        </div>

        {receipt && (
          <div className="receipt">
            <CheckCircle2 size={15} />
            <span>区块 {receipt.blockNumber.toString()} 已确认</span>
          </div>
        )}
      </div>
    </main>
  );
}

/* ---- helper components & utils ---- */

function formatToken(raw: bigint, token: SupportedToken): string {
  return trimDecimals(formatUnits(raw, token.decimals));
}

function trimDecimals(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/u, "").replace(/\.$/u, "");
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function countDuplicateAddresses(addresses: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const address of addresses) {
    const key = address.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function walletBalanceLabel({
  balanceFmt,
  isError,
  isLoading,
  isReady,
}: {
  balanceFmt: string;
  isError: boolean;
  isLoading: boolean;
  isReady: boolean;
}): string {
  if (isError) return "读取失败";
  if (isLoading || !isReady) return "读取中";
  return trimDecimals(balanceFmt);
}

function explorerBase(chainId: number): string {
  if (chainId === 8453) return "https://basescan.org";
  if (chainId === 56) return "https://bscscan.com";
  return "https://etherscan.io";
}

function txUrl(chainId: number, hash: string): string {
  return `${explorerBase(chainId)}/tx/${hash}`;
}

function addressUrl(chainId: number, address: string): string {
  return `${explorerBase(chainId)}/address/${address}`;
}
