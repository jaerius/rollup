// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract BondManager {
    // 각 주소의 보증금을 저장하는 매핑
    mapping(address => uint256) public bonds;

    // 보증금이 예치되었을 때 발생하는 이벤트
    event BondDeposited(address indexed depositor, uint256 amount);
    // 보증금이 인출되었을 때 발생하는 이벤트
    event BondWithdrawn(address indexed withdrawer, uint256 amount);

    // 보증금을 예치하는 함수, msg.value를 보증금으로 추가
    function deposit() public payable {
        bonds[msg.sender] += msg.value;
        emit BondDeposited(msg.sender, msg.value);
    }

    // 보증금을 인출하는 함수
    function withdraw(uint256 _amount) public {
        // 인출 금액이 보증금보다 크지 않은지 확인
        require(bonds[msg.sender] >= _amount, "Insufficient bond");
        bonds[msg.sender] -= _amount;
        payable(msg.sender).transfer(_amount);
        emit BondWithdrawn(msg.sender, _amount);
    }

    // 보증금을 업데이트하는 함수
    function updateBond(address _account, uint256 _amount) public {
        bonds[_account] = _amount;
    }
}
