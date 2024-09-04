import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname과 __filename을 설정
// const __dirname = path.resolve();

async function main() {
  const contracts = [
    'StateCommitmentChain',
    'CanonicalTransactionChain',
    'BondManager',
    'FraudVerifier',
  ]; // Add the names of the contracts you want to deploy

  const addresses: { [key: string]: string } = {};

  for (const contractName of contracts) {
    const Contract = await ethers.getContractFactory(contractName);
    const contract = await Contract.deploy();

    await contract.deployed();

    console.log(`${contractName} deployed to:`, contract.address);

    addresses[contractName] = contract.address;
  }

  fs.writeFileSync(
    path.join(__dirname, '../deployedAddresses.json'),
    JSON.stringify(addresses, null, 2),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
