import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
  const addresses: { [key: string]: string } = {};

  // 1. StateCommitmentChain 배포
  const StateCommitmentChain = await ethers.getContractFactory(
    'StateCommitmentChain',
  );
  const scc = await StateCommitmentChain.deploy();
  await scc.deployed();
  console.log('StateCommitmentChain deployed to:', scc.address);
  addresses['StateCommitmentChain'] = scc.address;

  // 2. CanonicalTransactionChain 배포
  const CanonicalTransactionChain = await ethers.getContractFactory(
    'CanonicalTransactionChain',
  );
  const ctc = await CanonicalTransactionChain.deploy();
  await ctc.deployed();
  console.log('CanonicalTransactionChain deployed to:', ctc.address);
  addresses['CanonicalTransactionChain'] = ctc.address;

  // 3. BondManager 배포
  const BondManager = await ethers.getContractFactory('BondManager');
  const bm = await BondManager.deploy();
  await bm.deployed();
  console.log('BondManager deployed to:', bm.address);
  addresses['BondManager'] = bm.address;

  // 4. FraudVerifier 배포, 생성자에 필요한 인자들을 전달
  const FraudVerifier = await ethers.getContractFactory('FraudVerifier');
  const fraudVerifier = await FraudVerifier.deploy(
    scc.address,
    ctc.address,
    bm.address,
  );
  await fraudVerifier.deployed();
  console.log('FraudVerifier deployed to:', fraudVerifier.address);
  addresses['FraudVerifier'] = fraudVerifier.address;

  // 5. 배포된 주소들을 파일에 저장
  fs.writeFileSync(
    path.join(__dirname, '../deployedAddresses.json'),
    JSON.stringify(addresses, null, 2),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
