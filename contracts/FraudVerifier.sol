// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "./StateCommitmentChain.sol";
import "./CanonicalTransactionChain.sol";
import "./BondManager.sol";

contract FraudVerifier {
    StateCommitmentChain public stateCommitmentChain;
    CanonicalTransactionChain public canonicalTransactionChain;
    BondManager public bondManager;

    // Challenge 구조체 정의: 챌린저, 타임스탬프, 해결 여부를 포함
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

    // 챌린지들을 저장하는 매핑
    mapping(uint256 => Challenge) public challenges;

    // 챌린지가 시작되었을 때 발생하는 이벤트
    event ChallengeInitiated(uint256 indexed batchIndex, address indexed challenger, bytes32 _txHash);
    // 챌린지가 해결되었을 때 발생하는 이벤트
    event ChallengeResolved(uint256 indexed batchIndex, bool success, address proposer);

    uint256 constant MIN_TRANSACTION_AMOUNT = 1 wei;

    // 생성자, 다른 컨트랙트들의 주소를 인자로 받음
    constructor(address _scc, address _ctc, address _bm) {
        stateCommitmentChain = StateCommitmentChain(_scc);
        canonicalTransactionChain = CanonicalTransactionChain(_ctc);
        bondManager = BondManager(_bm);
    }

    // 챌린지를 시작하는 함수
    function initiateChallenge(uint256 _batchIndex, bytes32 _txHash) public {
        // 챌린저가 보증금을 예치했는지 확인
        require(bondManager.bonds(msg.sender) > 0, "No bond deposited");
        // 상태 배치 정보를 가져옴
        (bytes memory batchData, bytes32 stateRoot, uint256 timestamp, bool finalized, address proposer, bytes32 batchId) = stateCommitmentChain.getBatch(_batchIndex);
        require(!finalized, "Batch already finalized");
        // 챌린지가 이미 해결되지 않았는지 확인
        
        require(!challenges[_batchIndex].resolved, "Challenge already resolved");

        // 챌린지 정보 저장
        challenges[_batchIndex] = Challenge({
            challenger: msg.sender,
            timestamp: block.timestamp,
            resolved: false,
            challengedTxHash: bytes32(uint256(_txHash))
        });

        // 챌린지 시작 이벤트 발생
        emit ChallengeInitiated(_batchIndex, msg.sender, _txHash);
    }

       // 상태 전이를 검증하는 함수
        function verifyStateTransition(
            bytes32 _preStateRoot,
            bytes32 _postStateRoot,
            bytes memory _transaction
        ) public returns (bool) {
            // 트랜잭션을 적용한 후의 상태 루트를 계산
            bytes32 computedPostStateRoot = keccak256(abi.encodePacked(_preStateRoot, _transaction));
            // 계산된 상태 루트가 전달된 상태 루트와 일치하는지 확인
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

        // 2. 논스 검증
        if (txData.nonce != accounts[signer].nonce) {
                return false;
            }
        // 3. 잔액 검증
        uint256 totalCost = txData.value + (txData.gasLimit * txData.gasPrice);
        if (accounts[signer].balance < totalCost) {
             return false;
        }
        // 4. 최소 트랜잭션 금액 검증
        if (txData.value < MIN_TRANSACTION_AMOUNT) return false;

        // 5. 수신자 주소 유효성 검증
        if (txData.to == address(0)) return false;

        // 6. 자기 자신에게 보내는 트랜잭션 방지
        if (signer == txData.to) return false;

        // 7. 오버플로우 방지
        if (txData.value + (txData.gasLimit * txData.gasPrice) < txData.value) return false;

        return true;
        
        //return canonicalTransactionChain.isValidTransaction(_transaction);
    }

    function splitSignature(bytes memory sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    // 챌린지를 해결하는 함수
    function resolveChallenge(uint256 _batchIndex, bytes32 _preStateRoot, bytes32 _postStateRoot, bytes memory _transaction) public {
        Challenge storage challenge = challenges[_batchIndex];
        require(!challenge.resolved, "Challenge already resolved");
        require(block.timestamp >= challenge.timestamp + stateCommitmentChain.challengePeriod(), "Challenge period not over");

        (bytes memory batchData, bytes32 stateRoot, uint256 timestamp, bool finalized, address proposer, bytes32 batchId) = stateCommitmentChain.getBatch(_batchIndex);
        require(!finalized, "Batch already finalized");

        //상태 전이 검증
        bool success = verifyStateTransition(_preStateRoot, _postStateRoot, _transaction) && verifyTransaction(_batchIndex, _transaction);

        // 챌린지 해결로 표시
        challenge.resolved = true;

        //( , , , address proposer) = stateCommitmentChain.batches(_batchIndex);

        if (success) {
            // 상태 배치 최종화 및 보증금 반환
            stateCommitmentChain.finalizeBatch(_batchIndex);
            bondManager.withdraw(bondManager.bonds(challenge.challenger));
            bondManager.updateBond(proposer, 0); // 보증금 소각
        } else {
            // 보증금 소각
            bondManager.updateBond(challenge.challenger, 0);
        }

        // 챌린지 해결 이벤트 발생
        emit ChallengeResolved(_batchIndex, success, proposer);
    }
}
