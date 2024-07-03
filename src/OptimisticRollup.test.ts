import { ethers } from 'ethers';
import  OptimisticRollup from './OptimisticRollup'
import { Transaction, SignedTransaction } from './interfaces/Transaction';
import { get } from 'http';
import TransactionService from './services/TransactionService';
import StateService from './services/StateService';
import Level from 'level';

const ganachePrivateKeys = {
    '0xc281Bb9C950c65C7661c912E1DaC4Af38e7055C2': '0xfaa8c492b7fd21ed3e9a0e4f3a621bbe044f518e7867723432439015e918360c', // 여기에 실제 개인 키를 입력합니다.
    '0x001E436e37973c207b14053d78897DaB17d7cc4d': '0x27b3b8bd057b6409219805199d3ee149c0cf57983fa5c7af720303c7e9bf34c0',
    '0xD341949f9CDDc00953CF4E2050F380989d810CB4': '0x87373d62bac14d7f778aadaf90f1ab2c91540a84f7770b89e43b5f4d163cf654',
    '0x12fb2d274742b3F274fe0D92cE6227C4bf60B944': '0x368d55f41d663943add2efb62be85d8986126312e913f293fdbc980f3324b25e'
};

const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');

// 서명된 트랜잭션을 생성하는 함수
async function createSignedTransaction(tx: Transaction, signer: ethers.Signer): Promise<{ signedTx: SignedTransaction; sig: any }> {

    const transactionService = new TransactionService();
    return await transactionService.signTransaction(tx, signer);
}

// 트랜잭션을 검증하는 함수
async function verifyTransaction(signedTx: SignedTransaction, sig: any, rollup: OptimisticRollup): Promise<boolean> {
    const transactionService = new TransactionService();
    return await transactionService.verifyTransaction(signedTx, sig);
}

async function signAndVerify(tx: Transaction, provider: ethers.providers.Provider): Promise<SignedTransaction | null> {
    const privateKey = ganachePrivateKeys[tx.from];
    if (!privateKey) {
        console.error('해당 계정의 개인 키가 존재하지 않습니다:', tx.from);
        return null;
    }

    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`트랜잭션 서명 중... (from: ${tx.from})`);
    const { signedTx, sig } = await createSignedTransaction(tx, wallet);
    console.log('서명된 트랜잭션:', signedTx);

    console.log('트랜잭션 검증 중...');
    const rollup = new OptimisticRollup(1);
    const isValid = await verifyTransaction(signedTx, sig, rollup);
    console.log('트랜잭션 검증 결과:', isValid ? '유효함' : '유효하지 않음');

    return isValid ? signedTx : null;
}

async function getNetworkInfo() {
    try {
      const network = await provider.getNetwork();
      console.log('Network ID:', network.chainId);
      console.log('Network Name:', network.name);
    } catch (error) {
      console.error('Error fetching network info:', error);
    }
  }

  
  

async function main() {
    
    // 나머지 블록체인 로직 실행
    console.log('설정을 시작합니다...');
    const difficulty = 1;
    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545'); // 로컬 노드에 연결
    const privateKey = '0x9bb48d1859388d71be20ac50349f8f211977a3fcdb03266f35827404efcfeb35'; // 테스트용 개인 키
    console.log("getnetworkinfo",getNetworkInfo())
    const rollup = new OptimisticRollup(difficulty);
    const wallet = new ethers.Wallet(privateKey, provider);
    rollup.l1Contract = rollup.l1Contract.connect(wallet);
    console.log("getnetworkinfo",getNetworkInfo())
    const ganacheAccounts = await provider.listAccounts();
    for (const account of ganacheAccounts) {
        const balance = await provider.getBalance(account);
        rollup.deposit(account, BigInt(balance.toString()));
    }
    
    async function waitForStateBatchAppended(rollup: OptimisticRollup, batchId: string) {
        return new Promise<void>((resolve, reject) => {
            rollup.l1Contract.once('StateBatchAppended', (batchIndex, batchData, stateRoot, transactionsRoot, proposer, appendedBatchId) => {
                if (appendedBatchId === batchId) {
                    resolve();
                }
            });
        });
    }

    console.log('예제 트랜잭션 데이터를 준비합니다...');
    const transactions1: Transaction[] = [
        {
            from: '0xc281Bb9C950c65C7661c912E1DaC4Af38e7055C2',
            to: '0x001E436e37973c207b14053d78897DaB17d7cc4d',
            amount: BigInt(10),
            fee: BigInt(1),
            nonce: BigInt(0),
            data: '0x',
            gasPrice: BigInt(1),
            gasLimit: BigInt(21000),
            chainId: 1,
            hash: ''
        },
        {
            from: '0x001E436e37973c207b14053d78897DaB17d7cc4d',
            to: '0xD341949f9CDDc00953CF4E2050F380989d810CB4',
            amount: BigInt(20),
            fee: BigInt(1),
            nonce: BigInt(1),
            data: '0x',
            gasPrice: BigInt(1),
            gasLimit: BigInt(21000),
            chainId: 1,
            hash: ''
        },
    ];

    const transactions2: Transaction[] = [
        {
            from: '0xD341949f9CDDc00953CF4E2050F380989d810CB4',
            to: '0x12fb2d274742b3F274fe0D92cE6227C4bf60B944',
            amount: BigInt(5),
            fee: BigInt(1),
            nonce: BigInt(2),
            data: '0x',
            gasPrice: BigInt(1),
            gasLimit: BigInt(21000),
            chainId: 1,
            hash: ''
        },
        {
            from: '0xD341949f9CDDc00953CF4E2050F380989d810CB4',
            to: '0xc281Bb9C950c65C7661c912E1DaC4Af38e7055C2',
            amount: BigInt(15),
            fee: BigInt(1),
            nonce: BigInt(3),
            data: '0x',
            gasPrice: BigInt(1),
            gasLimit: BigInt(21000),
            chainId: 1,
            hash: ''
        },
    ];

    const transactions3: Transaction[] = [
        {
            from: '0xc281Bb9C950c65C7661c912E1DaC4Af38e7055C2',
            to: '0xD341949f9CDDc00953CF4E2050F380989d810CB4',
            amount: BigInt(3),
            fee: BigInt(1),
            nonce: BigInt(4),
            data: '0x',
            gasPrice: BigInt(1),
            gasLimit: BigInt(21000),
            chainId: 1,
            hash: ''
        },
        {
            from: '0xc281Bb9C950c65C7661c912E1DaC4Af38e7055C2',
            to: '0x12fb2d274742b3F274fe0D92cE6227C4bf60B944',
            amount: BigInt(10),
            fee: BigInt(1),
            nonce: BigInt(5),
            data: '0x',
            gasPrice: BigInt(1),
            gasLimit: BigInt(21000),
            chainId: 1,
            hash: ''
        }
    ];

    const signedTransactions1: SignedTransaction[] = [];
    for (const tx of transactions1) {
        const signedTx = await signAndVerify(tx, provider);
        if (signedTx) signedTransactions1.push(signedTx);
    }

    const signedTransactions2: SignedTransaction[] = [];
    for (const tx of transactions2) {
        const signedTx = await signAndVerify(tx, provider);
        if (signedTx) signedTransactions2.push(signedTx);
    }

    const signedTransactions3: SignedTransaction[] = [];
    for (const tx of transactions3) {
        const signedTx = await signAndVerify(tx, provider);
        if (signedTx) signedTransactions3.push(signedTx);
    }

    console.log('Proposer 리스트를 준비합니다...');
    const proposers = [
        '0x2a6129C6ab8f1d46Aee325CDdFbaB48736218b74',
        '0xa99Fc058349173744e2b584B5BF0dCa22ABF0B7A',
        '0x8730253a7A12516A4Bc128B2aAC5cBf4f8bBb50C'
    ];



    // 첫 번째 배치
    console.log('첫 번째 블록 생성 중...');
    rollup.pendingTransactions.push(...signedTransactions1);
    const batchId1 = await rollup.processBatch(proposers);
    

    
    // 두 번째 배치
    console.log('두 번째 블록 생성 중...');
    rollup.pendingTransactions.push(...signedTransactions2);
    const batchId2 = await rollup.processBatch(proposers);
    await rollup.verifyBatch(batchId1);
    await waitForStateBatchAppended(rollup, batchId2);

    // 세 번째 배치
    console.log('세 번째 블록 생성 중...');
    rollup.pendingTransactions.push(...signedTransactions3);
    await rollup.processBatch(proposers);
    const batchId3 = await rollup.processBatch(proposers);
    await waitForStateBatchAppended(rollup, batchId3);

    
    //await rollup.verifyBatch(batchId1);
    await rollup.verifyBatch(batchId2);
    await rollup.verifyBatch(batchId3);


    console.log('PoW 시뮬레이션 및 배치 제안 완료');
}

main().catch(error => {
    console.error('오류가 발생했습니다:', error);
});
