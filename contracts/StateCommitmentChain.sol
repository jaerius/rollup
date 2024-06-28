// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract StateCommitmentChain is Ownable { // ownable 권한 제어어
    // Batch 구조체 정의: 상태 루트, 타임스탬프, 최종화 여부를 포함
    struct Batch {
        bytes32 stateRoot;
        uint256 timestamp;
        bool finalized;
        address proposer;
    }

    // Batch 배열을 저장하는 public 상태 변수
    Batch[] public batches;
    uint256 public challengePeriod = 7 days;

    // 상태 배치가 추가되었을 때 발생하는 이벤트
    event StateBatchAppended(uint256 indexed batchIndex, bytes32 stateRoot, address proposer);
    // 상태 배치가 최종화되었을 때 발생하는 이벤트
    event StateBatchFinalized(uint256 indexed batchIndex);

    // 계약 생성자, Ownable의 생성자에 소유자 주소를 전달
    constructor() Ownable() {}

    // 상태 배치를 추가하는 함수, onlyOwner 제어자로 소유자만 호출 가능
    function appendStateBatch(bytes32[] memory _batch, address _proposer) public onlyOwner {
        // 전달된 배치 배열의 각 요소를 순회하며 batches 배열에 추가
        for (uint i = 0; i < _batch.length; i++) {
            batches.push(Batch({
                stateRoot: _batch[i],
                timestamp: block.timestamp,
                finalized: false,
                proposer: _proposer
            }));
            // 상태 배치가 추가되었음을 알리는 이벤트 발생
            emit StateBatchAppended(batches.length - 1, _batch[i], _proposer);
        }
    }

    // 상태 배치를 최종화하는 함수
    function finalizeBatch(uint256 _batchIndex) public {
        require(!batches[_batchIndex].finalized, "Batch already finalized");
        require(block.timestamp >= batches[_batchIndex].timestamp + challengePeriod, "Challenge period not over");

        // 배치를 최종화하고 이벤트 발생
        batches[_batchIndex].finalized = true;
        emit StateBatchFinalized(_batchIndex);
    }

    // 상태 배치를 제출하는 함수, 소유자만 호출 가능
    function submitBatch(bytes32[] memory _batch, address _proposer) public onlyOwner {
        appendStateBatch(_batch, _proposer);
    }
}
