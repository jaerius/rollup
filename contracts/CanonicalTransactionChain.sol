// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract CanonicalTransactionChain {
    // QueueElement 구조체 정의: 트랜잭션 해시와 타임스탬프를 포함
    struct QueueElement {
        bytes32 transactionHash;
        uint256 timestamp;
    }

    // QueueElement 배열을 저장하는 public 상태 변수
    QueueElement[] public queue;

    // 트랜잭션이 큐에 추가되었을 때 발생하는 이벤트
    event TransactionEnqueued(bytes32 indexed transactionHash, uint256 indexed timestamp);

    // 트랜잭션을 큐에 추가하는 함수
    function enqueue(bytes32 _transactionHash) public {
        queue.push(QueueElement({
            transactionHash: _transactionHash,
            timestamp: block.timestamp
        }));
        emit TransactionEnqueued(_transactionHash, block.timestamp);
    }
}
