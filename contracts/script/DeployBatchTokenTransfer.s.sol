// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";

import { BatchTokenTransfer } from "../src/BatchTokenTransfer.sol";

/// @notice Deploys the stateless BatchTokenTransfer sender. Chain-agnostic —
/// re-run per chain by pointing --rpc-url at a different network. The
/// contract has no constructor arguments and no chain-specific config.
contract DeployBatchTokenTransfer is Script {
    function run() external returns (BatchTokenTransfer deployed) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        deployed = new BatchTokenTransfer();
        vm.stopBroadcast();

        console2.log("BatchTokenTransfer deployed at:", address(deployed));
    }
}
