// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract CanonicalTransactionChain {
    struct QueueElement {
        bytes32 transactionHash;
        uint256 timestamp;
    }

    struct Batch {
        uint256 startTransactionIndex;
        uint256 endTransactionIndex;
    }

    QueueElement[] public queue;
    mapping(uint256 => bytes) public transactions;
    mapping(uint256 => Batch) public batches;
    uint256 public nextQueueIndex;
    uint256 public nextTransactionIndex;
    uint256 public nextBatchIndex;

    event TransactionEnqueued(bytes32 indexed transactionHash, uint256 indexed timestamp);
    event TransactionBatchAppended(uint256 indexed batchIndex, uint256 indexed startIndex, uint256 indexed endIndex);

    function enqueue(bytes32 _transactionHash) public {
        queue.push(QueueElement({
            transactionHash: _transactionHash,
            timestamp: block.timestamp
        }));
        emit TransactionEnqueued(_transactionHash, block.timestamp);
    }

    function appendTransactionBatch(bytes[] memory _transactions) public {
        uint256 startIndex = nextTransactionIndex;
        for (uint256 i = 0; i < _transactions.length; i++) {
            transactions[nextTransactionIndex] = _transactions[i];
            nextTransactionIndex++;
        }
        uint256 endIndex = nextTransactionIndex - 1;

        batches[nextBatchIndex] = Batch({
            startTransactionIndex: startIndex,
            endTransactionIndex: endIndex
        });
        nextBatchIndex++;

        emit TransactionBatchAppended(nextBatchIndex - 1, startIndex, endIndex);
    }

    function getTransaction(uint256 batchIndex, uint256 _index) public view returns (bytes memory) {
        require(batchIndex < nextBatchIndex, "Batch index out of bounds");
        Batch storage batch = batches[batchIndex];
        uint256 transactionIndex = batch.startTransactionIndex + _index;
        require(transactionIndex <= batch.endTransactionIndex, "Transaction index out of bounds");
        return transactions[transactionIndex];
    }

    function getQueueElement(uint256 _index) public view returns (bytes32, uint256) {
        require(_index < queue.length, "Queue index out of bounds");
        QueueElement memory element = queue[_index];
        return (element.transactionHash, element.timestamp);
    }

    function getQueueLength() public view returns (uint256) {
        return queue.length;
    }

    function getBatchTransactionCount(uint256 batchIndex) public view returns (uint256) {
        require(batchIndex < nextBatchIndex, "Batch index out of bounds");
        Batch storage batch = batches[batchIndex];
        return batch.endTransactionIndex - batch.startTransactionIndex + 1;
    }
}
