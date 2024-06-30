// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "./StateCommitmentChain.sol";
import "./CanonicalTransactionChain.sol";
import "./BondManager.sol";

contract FraudVerifier {
    StateCommitmentChain public stateCommitmentChain;
    CanonicalTransactionChain public canonicalTransactionChain;
    BondManager public bondManager;

    struct Challenge {
        address challenger;
        uint256 timestamp;
        bool resolved;
        bytes32 challengedTxHash;
    }

    struct TransactionData {
        uint256 nonce;
        uint256 gasPrice;
        uint256 gasLimit;
        address to;
        uint256 value;
        bytes data;
        uint256 chainId;
        bytes signature; // r, s, v 값을 포함
    }

    struct Account {
        uint256 nonce;
        uint256 balance;
    }

    mapping(address => Account) public accounts;
    mapping(uint256 => Challenge) public challenges;

    event ChallengeInitiated(uint256 indexed batchIndex, address indexed challenger, bytes32 _txHash);
    event ChallengeResolved(uint256 indexed batchIndex, bool success, address proposer);

    uint256 constant MIN_TRANSACTION_AMOUNT = 1 wei;

    constructor(address _scc, address _ctc, address _bm) {
        stateCommitmentChain = StateCommitmentChain(_scc);
        canonicalTransactionChain = CanonicalTransactionChain(_ctc);
        bondManager = BondManager(_bm);
    }

    function initiateChallenge(uint256 _batchIndex, bytes32 _txHash) public {
        require(bondManager.bonds(msg.sender) > 0, "No bond deposited");
        (, , bool finalized, , ) = stateCommitmentChain.getBatch(_batchIndex);
        require(!finalized, "Batch already finalized");
        require(!challenges[_batchIndex].resolved, "Challenge already resolved");

        challenges[_batchIndex] = Challenge({
            challenger: msg.sender,
            timestamp: block.timestamp,
            resolved: false,
            challengedTxHash: _txHash
        });

        emit ChallengeInitiated(_batchIndex, msg.sender, _txHash);
    }

    function verifyStateTransition(bytes32 _preStateRoot, bytes32 _postStateRoot, bytes memory _transaction) public pure returns (bool) {
        bytes32 computedPostStateRoot = keccak256(abi.encodePacked(_preStateRoot, _transaction));
        return computedPostStateRoot == _postStateRoot;
    }

    function verifyTransaction(uint256 _batchIndex, bytes memory _transaction) public view returns (bool) {
        Challenge storage challenge = challenges[_batchIndex];
        require(!challenge.resolved, "Challenge already resolved");

        TransactionData memory txData = abi.decode(_transaction, (TransactionData));

        bytes32 txHash = keccak256(abi.encodePacked(
            txData.nonce,
            txData.gasPrice,
            txData.gasLimit,
            txData.to,
            txData.value,
            txData.data,
            txData.chainId
        ));

        if (txHash != challenge.challengedTxHash) {
            return false;
        }

        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", txHash));
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(txData.signature);
        address signer = ecrecover(messageHash, v, r, s);

        if (txData.nonce != accounts[signer].nonce || accounts[signer].balance < (txData.value + (txData.gasLimit * txData.gasPrice))) {
            return false;
        }

        if (txData.value < MIN_TRANSACTION_AMOUNT || txData.to == address(0) || signer == txData.to || txData.value + (txData.gasLimit * txData.gasPrice) < txData.value) {
            return false;
        }

        return true;
    }

    function splitSignature(bytes memory sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    function resolveChallenge(bytes32 _batchId, bytes32 _preStateRoot, bytes32 _postStateRoot, bytes memory _transaction, bytes32 _stateRoot, uint256 _timestamp, address _proposer) public {
        Challenge storage challenge = challenges[uint256(_batchId)];
        require(!challenge.resolved, "Challenge already resolved");
        require(block.timestamp >= challenge.timestamp + stateCommitmentChain.challengePeriod(), "Challenge period not over");

        bool success = verifyStateTransition(_preStateRoot, _postStateRoot, _transaction) && verifyTransaction(uint256(_batchId), _transaction);

        challenge.resolved = true;

        if (success) {
            stateCommitmentChain.finalizeBatch(_batchId, _stateRoot, _timestamp, _proposer);
            bondManager.withdraw(bondManager.bonds(challenge.challenger));
            bondManager.updateBond(_proposer, 0);
        } else {
            bondManager.updateBond(challenge.challenger, 0);
        }

        emit ChallengeResolved(uint256(_batchId), success, _proposer);
    }
}
