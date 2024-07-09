import { ethers } from 'ethers';
import  OptimisticRollup from './OptimisticRollup'
import { Transaction, SignedTransaction } from './interfaces/Transaction';
import { get } from 'http';
import TransactionService from './services/TransactionService';
import StateService from './services/StateService';
import Level from 'level';
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const ganachePrivateKeys = {
    '0x1fD45E37Aa9b1B18621A910e0e2BCdd3FCd4c3F8': '0xb27ce489c8268ed5b406cee761524a9e0725bd4c0cf36965aed6b0588cbbb5e0', // 여기에 실제 개인 키를 입력합니다.
    '0xCa1fB9993215DCD9e6fDB042d5985f87F22CcbA4': '0x62d82ef4208c572860d2e5480454a72ea3b21dc32eebd3c1dde053c30e53f3ee',
    '0xFEBBaD4c627aFAB2D717ed178d27D570FFD36C2a': '0x1d4f938a1ba1ab7d88fcbc44720771d998781f14edbbe0579695aee3c3edfb35',
    '0xa9b543604704c19a5fBd726D1AF95D34Ea9F0A55': '0xb28284568c1fdc0369000e6e7c30e9b7cf73768881e4c86a1f918dec759b1725'
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
    const privateKey = '0xc73b85200708cef58456b9d668ad2fcfd8491cfd1fb13e470b040b58636b2829'; // 테스트용 개인 키
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
            from: '0x1fD45E37Aa9b1B18621A910e0e2BCdd3FCd4c3F8',
            to: '0xCa1fB9993215DCD9e6fDB042d5985f87F22CcbA4',
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
            from: '0xCa1fB9993215DCD9e6fDB042d5985f87F22CcbA4',
            to: '0xFEBBaD4c627aFAB2D717ed178d27D570FFD36C2a',
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
            from: '0x1fD45E37Aa9b1B18621A910e0e2BCdd3FCd4c3F8',
            to: '0xFEBBaD4c627aFAB2D717ed178d27D570FFD36C2a',
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
            from: '0xFEBBaD4c627aFAB2D717ed178d27D570FFD36C2a',
            to: '0x1fD45E37Aa9b1B18621A910e0e2BCdd3FCd4c3F8',
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
            from: '0x1fD45E37Aa9b1B18621A910e0e2BCdd3FCd4c3F8',
            to: '0xFEBBaD4c627aFAB2D717ed178d27D570FFD36C2a',
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
            from: '0x1fD45E37Aa9b1B18621A910e0e2BCdd3FCd4c3F8',
            to: '0xa9b543604704c19a5fBd726D1AF95D34Ea9F0A55',
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
    //await waitForStateBatchAppended(rollup, batchId1);

    
    // 두 번째 배치
    console.log('두 번째 블록 생성 중...');
    rollup.pendingTransactions.push(...signedTransactions2);
    const batchId2 = await rollup.processBatch(proposers);
    
   // await waitForStateBatchAppended(rollup, batchId2);

    // // 세 번째 배치
    // console.log('세 번째 블록 생성 중...');
    // rollup.pendingTransactions.push(...signedTransactions3);
    // await rollup.processBatch(proposers);
    // const batchId3 = await rollup.processBatch(proposers);
    // await waitForStateBatchAppended(rollup, batchId3);

    
    //await rollup.verifyBatch(batchId1);
    await wait(20000);
    await rollup.verifyBatch(batchId2);
    // await rollup.verifyBatch(batchId2);
    // await rollup.verifyBatch(batchId3);


    console.log('PoW 시뮬레이션 및 배치 제안 완료');
}

main().catch(error => {
    console.error('오류가 발생했습니다:', error);
});
