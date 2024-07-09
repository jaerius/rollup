import { ethers } from 'ethers';
import fs from 'fs';

const abiPath = './build/contracts/BondManager.json';
const contractJson = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
const contractABI = contractJson.abi;
const contractAddress = contractJson.networks['1720548607691'].address;
const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
const signer = provider.getSigner();
const BondManagerContract = new ethers.Contract(contractAddress, contractABI, signer);

export default BondManagerContract;
