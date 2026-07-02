// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Stateless ERC20 batch sender for operator compensation and small payout runs.
/// @dev The caller must approve this contract for the total token amount before calling.
contract BatchTokenTransfer {
    using SafeERC20 for IERC20;

    error ZeroToken();
    error EmptyBatch();
    error LengthMismatch();
    error ZeroRecipient(uint256 index);
    error ZeroAmount(uint256 index);

    event BatchTransfer(
        address indexed sender, address indexed token, uint256 recipientCount, uint256 totalAmount
    );
    event BatchTransferItem(
        address indexed sender, address indexed token, address indexed recipient, uint256 amount
    );

    function batchTransferERC20(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external returns (uint256 totalAmount) {
        if (token == address(0)) revert ZeroToken();
        if (recipients.length == 0) revert EmptyBatch();
        if (recipients.length != amounts.length) revert LengthMismatch();

        IERC20 erc20 = IERC20(token);

        for (uint256 i = 0; i < recipients.length; ++i) {
            address recipient = recipients[i];
            uint256 amount = amounts[i];
            if (recipient == address(0)) revert ZeroRecipient(i);
            if (amount == 0) revert ZeroAmount(i);

            totalAmount += amount;
            erc20.safeTransferFrom(msg.sender, recipient, amount);
            emit BatchTransferItem(msg.sender, token, recipient, amount);
        }

        emit BatchTransfer(msg.sender, token, recipients.length, totalAmount);
    }
}
