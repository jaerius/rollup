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
        uint256 batchIndex;
    }

    BatchInfo[] public batches;
    uint256 public latestValidBatch;
    uint256 public challengePeriod = 7 days;

    event StateBatchAppended(uint256 indexed batchIndex, bytes batchData, bytes32 stateRoot, bytes32 transactionsRoot, address proposer, bytes32 batchId);
    event StateBatchFinalized(uint256 indexed batchIndex);
    event ChallengePeriodUpdated(uint256 newChallengePeriod);
    event BatchInvalidated(uint256 indexed batchIndex);

    function appendStateBatch(bytes memory _calldata, bytes32 _stateRoot, bytes32 _transactionsRoot, address _proposer, bytes32 _batchId) public {
        // 원래 배치의 상태는 scc에, 배치 데이터는 ctc에 저장하려 했지만, 한 곳에 배치의 상태 & 데이터 저장
        BatchInfo memory newBatch = BatchInfo({ 
            batchData: _calldata,
            stateRoot: _stateRoot,
            transactionsRoot: _transactionsRoot,
            timestamp: block.timestamp,
            finalized: false,
            valid: true,
            proposer: _proposer,
            batchId: _batchId,
            batchIndex: batches.length
        });

        batches.push(newBatch);
        uint256 newBatchIndex = batches.length - 1;

        if (newBatchIndex == 0 || batches[newBatchIndex - 1].valid) {
            latestValidBatch = newBatchIndex;
        }
        // 이벤트 발생
        emit StateBatchAppended(newBatchIndex, _calldata, _stateRoot, _transactionsRoot, _proposer, _batchId);
    }
    // 배치 finalize
    function finalizeBatch(uint256 _batchIndex) public {
        require(_batchIndex < batches.length, "Batch index out of bounds");
        require(!batches[_batchIndex].finalized, "Batch already finalized");
        require(batches[_batchIndex].valid, "Cannot finalize invalid batch");
        require(block.timestamp >= batches[_batchIndex].timestamp + challengePeriod, "Challenge period not over");

        batches[_batchIndex].finalized = true;
        emit StateBatchFinalized(_batchIndex);
    }
    // 배치의 챌린지가 사실로 밝혀질 경우 배치 무효화를 추가
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
        bytes32 batchId,
        uint256 batchIndex
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
            batch.batchId,
            batch.batchIndex
        );
    }
    // 외부에서 배치 정보를 가져오기 위한 함수
    function getBatchByBatchId(bytes32 _batchId) public view returns (
        bytes memory batchData,
        bytes32 stateRoot,
        bytes32 transactionsRoot,
        uint256 timestamp,
        bool finalized,
        bool valid,
        address proposer,
        bytes32 batchId,
        uint256 batchIndex
    ) { // 배치 아이디를 키로 이용하여 배치 정보를 가져옴
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
                    batch.batchId,
                    batch.batchIndex
                );
            }
        }
        revert("Batch not found");
    }

    function getLatestValidBatch() public view returns (uint256) {
        return latestValidBatch;
    }

    function getBatchTransactionsRoot(bytes32 _batchId) public view returns (bytes32) {
        for (uint256 i = 0; i < batches.length; i++) {
            if (batches[i].batchId == _batchId) {
                return batches[i].transactionsRoot;
            }
        }
        revert("Batch not found");
    }

    function getBatchStateRoot(bytes32 _batchId) public view returns (bytes32) {
        for (uint256 i = 0; i < batches.length; i++) {
            if (batches[i].batchId == _batchId) {
                return batches[i].stateRoot;
            }
        }
        revert("Batch not found");
    }

    function getPreviousStateRoot(bytes32 _batchId) public view returns (bytes32) { // 이전 상태 루트 가져와서 다시 검증하기 위한 용도
        uint256 batchIndex = batches.length;  // 초기값을 batches.length로 설정하여 유효하지 않은 상태로 시작
        for (uint256 i = 0; i < batches.length; i++) {
            if (batches[i].batchId == _batchId) {
                batchIndex = i;
                break;
            }
        }

        // 유효한 배치가 없는 경우 오류 반환
        require(batchIndex < batches.length, "Batch with the given batchId not found");

        // 앞의 유효한 배치를 찾음
        for (uint256 i = batchIndex; i > 0; i--) {
            if (batches[i - 1].valid) {
                return batches[i - 1].stateRoot;
            }
        }

        revert("No valid previous state root found");
    }
}
