import { ethers } from 'ethers';
import { OptimisticRollup, Transaction, SignedTransaction } from './rollup';
import { get } from 'http';

const ganachePrivateKeys = {
    '0x45c875B4268715e3DB18acD752453716e6646e59': '0x15761f1fd4a8516767438e928ac0a14ee066b927ad35730c13d94631e691afdf', // 여기에 실제 개인 키를 입력합니다.
    '0x7f39A7695A752aB2831B6EEB5d6CfF915F377fA3': '0xb55f826288954d882113d9d75d18ee16153a5829c2d536d5a86fb900a75a8d8e',
    '0xC94eFa528FD40B06BFCeFa37fB313FCe5bb5B450': '0x8269a225263305bec7e3694bf6d0c459c522dd99a201e8ba142808b90432ebc4',
    '0x392056eeFBb5272626645f706b080e4C3a6D7fa1': '0x61c17067193c2f42886688cff9fadbb0c6b2c69abdd66a3879d30dd56993d221'
};

const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');

// 서명된 트랜잭션을 생성하는 함수
async function createSignedTransaction(tx: Transaction, signer: ethers.Signer): Promise<{ signedTx: SignedTransaction; sig: any }> {
    const rollup = new OptimisticRollup(1);
    return await rollup.signTransaction(tx, signer);
}

// 트랜잭션을 검증하는 함수
async function verifyTransaction(signedTx: SignedTransaction, sig: any, rollup: OptimisticRollup): Promise<boolean> {
    return await rollup.verifyTransaction(signedTx, sig);
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

// async function createHash(tx: Transaction, sig: any): Promise<{ signedTx: SignedTransaction; sig: any }> {
//     return await createHash(tx, sig);
// }
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
    const privateKey = '0x61c17067193c2f42886688cff9fadbb0c6b2c69abdd66a3879d30dd56993d221'; // 테스트용 개인 키
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

    console.log('예제 트랜잭션 데이터를 준비합니다...');
    const transactions1: Transaction[] = [
        {
            from: '0x45c875B4268715e3DB18acD752453716e6646e59',
            to: '0x7f39A7695A752aB2831B6EEB5d6CfF915F377fA3',
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
            from: '0x7f39A7695A752aB2831B6EEB5d6CfF915F377fA3',
            to: '0xC94eFa528FD40B06BFCeFa37fB313FCe5bb5B450',
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
            from: '0xC94eFa528FD40B06BFCeFa37fB313FCe5bb5B450',
            to: '0x392056eeFBb5272626645f706b080e4C3a6D7fa1',
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
            from: '0x392056eeFBb5272626645f706b080e4C3a6D7fa1',
            to: '0x45c875B4268715e3DB18acD752453716e6646e59',
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
            from: '0x45c875B4268715e3DB18acD752453716e6646e59',
            to: '0xC94eFa528FD40B06BFCeFa37fB313FCe5bb5B450',
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
            from: '0x45c875B4268715e3DB18acD752453716e6646e59',
            to: '0x392056eeFBb5272626645f706b080e4C3a6D7fa1',
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
    await rollup.processBatch(proposers);

    // 두 번째 배치
    console.log('두 번째 블록 생성 중...');
    rollup.pendingTransactions.push(...signedTransactions2);
    await rollup.processBatch(proposers);

    // 세 번째 배치
    console.log('세 번째 블록 생성 중...');
    rollup.pendingTransactions.push(...signedTransactions3);
    await rollup.processBatch(proposers);

    console.log('PoW 시뮬레이션 및 배치 제안 완료');
}

main().catch(error => {
    console.error('오류가 발생했습니다:', error);
});
