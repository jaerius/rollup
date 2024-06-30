// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract StateCommitmentChain {
    struct BatchInfo {
        bytes32 stateRoot;
        uint256 timestamp;
        bool finalized;
        address proposer;
        bytes32 batchId;
    }

    // 임시 저장소
    mapping(bytes32 => BatchInfo) public pendingBatches;
    // 최종 확정된 배치
    BatchInfo[] public finalizedBatches;

    BatchInfo[] public batches;
    uint256 public challengePeriod = 10 minutes;

    event StateBatchAppended(bytes32 indexed batchId, bytes batchData, bytes32 stateRoot, address proposer);
    event StateBatchFinalized(uint256 indexed batchIndex, bytes32 batchId);

    constructor() {}

    function appendStateBatch(bytes calldata _calldata, bytes32 _stateRoot, address _proposer, bytes32 _batchId) public {
        require(_calldata.length > 0, "Calldata cannot be empty");
        require(_proposer != address(0), "Proposer address cannot be zero");
        require(pendingBatches[_batchId].timestamp == 0, "Batch ID already exists");

        uint256 timestamp = block.timestamp;

        
        emit StateBatchAppended(_batchId, _calldata, _stateRoot, _proposer);
    }

    function finalizeBatch(bytes32 _batchId, bytes32 _stateRoot, uint256 _timestamp, address _proposer) public {
        // BatchInfo storage batch = pendingBatches[_batchId];
        // require(batch.timestamp != 0,   "Batch does not exist");
        // require(!batch.finalized, "Batch already finalized");
        // require(block.timestamp >= batch.timestamp + challengePeriod, "Challenge period not over");

        require(block.timestamp >= _timestamp + challengePeriod, "Challenge period not over");

        BatchInfo memory newBatch = BatchInfo({
            stateRoot: _stateRoot,
            timestamp: _timestamp,
            finalized: true,
            proposer: _proposer,
            batchId: _batchId
        });

        finalizedBatches.push(newBatch);
        emit StateBatchFinalized(finalizedBatches.length - 1, _batchId);

        delete pendingBatches[_batchId];
    }

    function getFinalizedBatchCount() public view returns (uint256) {
        return finalizedBatches.length;
    }

    function getBatch(uint256 _index) public view returns (bytes32 stateRoot, uint256 timestamp, bool finalized, address proposer, bytes32 batchId) {
        require(_index < finalizedBatches.length, "Batch index out of bounds");
        BatchInfo memory batch = finalizedBatches[_index];
        return (batch.stateRoot, batch.timestamp, batch.finalized, batch.proposer, batch.batchId);
    }
}