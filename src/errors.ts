export function formatBatchTransferError(error: unknown): string {
  if (!(error instanceof Error)) return "批量转账失败";
  if (error.message.includes("duplicate call detected")) {
    return "钱包已忽略重复提交，请等待当前钱包弹窗或交易完成";
  }
  return error.message;
}
