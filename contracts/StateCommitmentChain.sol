// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract StateCommitmentChain {
    struct BatchInfo {
        bytes batchData;
        bytes32 stateRoot;
        bytes32 transactionsRoot;
        uint256 timestamp;
        bool finalized;
        bool valid;
        address proposer;
        bytes32 batchId;
    }

    BatchInfo[] public batches;
    uint256 public latestValidBatch;
    uint256 public challengePeriod = 7 days;

    event StateBatchAppended(uint256 indexed batchIndex, bytes batchData, bytes32 stateRoot, bytes32 transactionsRoot, address proposer, bytes32 batchId);
    event StateBatchFinalized(uint256 indexed batchIndex);
    event ChallengePeriodUpdated(uint256 newChallengePeriod);
    event BatchInvalidated(uint256 indexed batchIndex);

    function appendStateBatch(bytes memory _calldata, bytes32 _stateRoot, bytes32 _transactionsRoot, address _proposer, bytes32 _batchId) public {
        BatchInfo memory newBatch = BatchInfo({
            batchData: _calldata,
            stateRoot: _stateRoot,
            transactionsRoot: _transactionsRoot,
            timestamp: block.timestamp,
            finalized: false,
            valid: true,
            proposer: _proposer,
            batchId: _batchId
        });

        batches.push(newBatch);
        uint256 newBatchIndex = batches.length - 1;

        if (newBatchIndex == 0 || batches[newBatchIndex - 1].valid) {
            latestValidBatch = newBatchIndex;
        }

        emit StateBatchAppended(newBatchIndex, _calldata, _stateRoot, _transactionsRoot, _proposer, _batchId);
    }

    function finalizeBatch(uint256 _batchIndex) public {
        require(_batchIndex < batches.length, "Batch index out of bounds");
        require(!batches[_batchIndex].finalized, "Batch already finalized");
        require(batches[_batchIndex].valid, "Cannot finalize invalid batch");
        require(block.timestamp >= batches[_batchIndex].timestamp + challengePeriod, "Challenge period not over");

        batches[_batchIndex].finalized = true;
        emit StateBatchFinalized(_batchIndex);
    }

    function invalidateBatch(uint256 _batchIndex) public {
        require(_batchIndex < batches.length, "Batch index out of bounds");
        require(!batches[_batchIndex].finalized, "Cannot invalidate finalized batch");
        require(batches[_batchIndex].valid, "Batch already invalidated");

        batches[_batchIndex].valid = false;

        if (_batchIndex == latestValidBatch) {
            while (latestValidBatch > 0 && !batches[latestValidBatch].valid) {
                latestValidBatch--;
            }
        }

        emit BatchInvalidated(_batchIndex);
    }

    function getBatch(uint256 _index) public view returns (
        bytes memory batchData,
        bytes32 stateRoot,
        bytes32 transactionsRoot,
        uint256 timestamp,
        bool finalized,
        bool valid,
        address proposer,
        bytes32 batchId
    ) {
        require(_index < batches.length, "Batch index out of bounds");
        BatchInfo memory batch = batches[_index];
        return (
            batch.batchData,
            batch.stateRoot,
            batch.transactionsRoot,
            batch.timestamp,
            batch.finalized,
            batch.valid,
            batch.proposer,
            batch.batchId
        );
    }

    function getBatchByBatchId(bytes32 _batchId) public view returns (
    bytes memory batchData,
    bytes32 stateRoot,
    bytes32 transactionsRoot,
    uint256 timestamp,
    bool finalized,
    bool valid,
    address proposer,
    bytes32 batchId
) {
    for (uint256 i = 0; i < batches.length; i++) {
        if (batches[i].batchId == _batchId) {
            BatchInfo memory batch = batches[i];
            return (
                batch.batchData,
                batch.stateRoot,
                batch.transactionsRoot,
                batch.timestamp,
                batch.finalized,
                batch.valid,
                batch.proposer,
                batch.batchId
            );
        }
    }
    revert("Batch not found");
}


    function getLatestValidBatch() public view returns (uint256) {
        return latestValidBatch;
    }

    function getBatchTransactionsRoot(uint256 _batchIndex) public view returns (bytes32) {
        return batches[_batchIndex].transactionsRoot;
    }

    function getBatchStateRoot(uint256 _batchIndex) public view returns (bytes32) {
        return batches[_batchIndex].stateRoot;
    }

    function getPreviousStateRoot(uint256 _batchIndex) public view returns (bytes32) {
        require(_batchIndex > 0, "No previous state root for first batch");

        // 이전 유효한 배치를 찾음
        for (uint256 i = _batchIndex - 1; i >= 0; i--) {
            if (batches[i].valid) {
                return batches[i].stateRoot;
            }
            // 루프 탈출 조건
            if (i == 0) break;
        }

        revert("No valid previous state root found");
    }
}



// pragma solidity >=0.4.22 <0.9.0;

// import "./FraudVerifier.sol";

// contract StateCommitmentChain {
//     struct BatchInfo {
//         bytes batchData;
//         bytes32 stateRoot;
//         uint256 timestamp;
//         bool finalized;
//         address proposer;
//         bytes32 batchId;
//     }

//     BatchInfo[] public batches;
//     uint256 public challengePeriod = 10 minutes;

//     event StateBatchAppended(uint256 indexed batchIndex, bytes batchData, bytes32 stateRoot, address proposer, bytes32 batchId);
//     event StateBatchFinalized(uint256 indexed batchIndex);

//     constructor() {}

//     function appendStateBatch(bytes memory _calldata, bytes32 _stateRoot, address _proposer, bytes32 _batchId) public {
//         require(_calldata.length > 0, "Calldata cannot be empty");
//         require(_proposer != address(0), "Proposer address cannot be zero");

//         BatchInfo memory newBatch = BatchInfo({
//             batchData: _calldata,
//             stateRoot: _stateRoot,
//             timestamp: block.timestamp,
//             finalized: false,
//             proposer: _proposer,
//             batchId: _batchId
//         });

//         batches.push(newBatch);

//         emit StateBatchAppended(batches.length - 1, _calldata, _stateRoot, _proposer, _batchId);
//     }

//     function finalizeBatch(uint256 _batchIndex) public {
//         require(!batches[_batchIndex].finalized, "Batch already finalized");
//         require(block.timestamp >= batches[_batchIndex].timestamp + challengePeriod, "Challenge period not over");

//         batches[_batchIndex].finalized = true;
//         emit StateBatchFinalized(_batchIndex);
//     }

//     function getBatchCount() public view returns (uint256) {
//         return batches.length;
//     }

//     function getBatch(uint256 _index) public view returns (bytes memory batchData, bytes32 stateRoot, uint256 timestamp, bool finalized, address proposer, bytes32 batchId) {
//         require(_index < batches.length, "Batch index out of bounds");
//         BatchInfo memory batch = batches[_index];
//         return (batch.batchData, batch.stateRoot, batch.timestamp, batch.finalized, batch.proposer, batch.batchId);
//     }
// }