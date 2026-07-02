export const batchTokenTransferAbi = [
  {
    type: "function",
    name: "batchTransferERC20",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ name: "totalAmount", type: "uint256" }],
  },
  {
    type: "event",
    name: "BatchTransfer",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "recipientCount", type: "uint256", indexed: false },
      { name: "totalAmount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BatchTransferItem",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;
