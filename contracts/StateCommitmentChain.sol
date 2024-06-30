// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract StateCommitmentChain {
    struct BatchInfo {
        bytes batchData;
        bytes32 stateRoot;
        uint256 timestamp;
        bool finalized;
        address proposer;
        bytes32 batchId;
    }

    BatchInfo[] public batches;
    uint256 public challengePeriod = 10 minutes;

    event StateBatchAppended(uint256 indexed batchIndex, bytes batchData, bytes32 stateRoot, address proposer, bytes32 batchId);
    event StateBatchFinalized(uint256 indexed batchIndex);

    constructor() {}

    function appendStateBatch(bytes memory _calldata, bytes32 _stateRoot, address _proposer, bytes32 _batchId) public {
        require(_calldata.length > 0, "Calldata cannot be empty");
        require(_proposer != address(0), "Proposer address cannot be zero");

        BatchInfo memory newBatch = BatchInfo({
            batchData: _calldata,
            stateRoot: _stateRoot,
            timestamp: block.timestamp,
            finalized: false,
            proposer: _proposer,
            batchId: _batchId
        });

        batches.push(newBatch);

        emit StateBatchAppended(batches.length - 1, _calldata, _stateRoot, _proposer, _batchId);
    }

    function finalizeBatch(uint256 _batchIndex) public {
        require(!batches[_batchIndex].finalized, "Batch already finalized");
        require(block.timestamp >= batches[_batchIndex].timestamp + challengePeriod, "Challenge period not over");

        batches[_batchIndex].finalized = true;
        emit StateBatchFinalized(_batchIndex);
    }

    function getBatchCount() public view returns (uint256) {
        return batches.length;
    }

    function getBatch(uint256 _index) public view returns (bytes memory batchData, bytes32 stateRoot, uint256 timestamp, bool finalized, address proposer, bytes32 batchId) {
        require(_index < batches.length, "Batch index out of bounds");
        BatchInfo memory batch = batches[_index];
        return (batch.batchData, batch.stateRoot, batch.timestamp, batch.finalized, batch.proposer, batch.batchId);
    }
}