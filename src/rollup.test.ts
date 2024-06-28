import { ethers } from 'ethers';
import { OptimisticRollup, Transaction, SignedTransaction } from './rollup';

const ganachePrivateKeys = {
    '0x6BF0a403c4e94392613250dbcec9465624b2E28E': '0x8b1b6a47904ef1471f71a187d29354461cb08767024f5924e31a4b0e398c2eed', // 여기에 실제 개인 키를 입력합니다.
    '0x7F0653Bf9cCbd88ef2e304C70cf865697094fd97': '0x16c5c92beb530264c90944fc57989f68772d074d18524817f06214f2a6e2bb79',
    '0x2Eb475f013135813D051Fe2E3C781FB565766634': '0x7a4c7917c75a3a31ab7cfb7ef43bf7137b95c4469ae45dce20a7486389600675',
    '0x53a5F8D3846bF3a1072bdE70f3A4566C268a4423': '0x447da867c01ac32e340646232567ab480cf93add98f9572c1e179f088842e192'
};


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

async function main() {
    
    // 나머지 블록체인 로직 실행
    console.log('설정을 시작합니다...');
    const difficulty = 1;
    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545'); // 로컬 노드에 연결
    const privateKey = '0xfa66f4e5075b1d181bb7bc7c327e117bb072d7e5f486f4cebe258cdd7b765dd9'; // 테스트용 개인 키
    
    const rollup = new OptimisticRollup(difficulty);
    const wallet = new ethers.Wallet(privateKey, provider);
    rollup.l1Contract = rollup.l1Contract.connect(wallet);

    const ganacheAccounts = await provider.listAccounts();
    for (const account of ganacheAccounts) {
        const balance = await provider.getBalance(account);
        rollup.deposit(account, BigInt(balance.toString()));
    }

    console.log('예제 트랜잭션 데이터를 준비합니다...');
    const transactions1: Transaction[] = [
        {
            from: '0x6BF0a403c4e94392613250dbcec9465624b2E28E',
            to: '0x7F0653Bf9cCbd88ef2e304C70cf865697094fd97',
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
            from: '0x7F0653Bf9cCbd88ef2e304C70cf865697094fd97',
            to: '0x2Eb475f013135813D051Fe2E3C781FB565766634',
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
            from: '0x2Eb475f013135813D051Fe2E3C781FB565766634',
            to: '0x53a5F8D3846bF3a1072bdE70f3A4566C268a4423',
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
            from: '0x53a5F8D3846bF3a1072bdE70f3A4566C268a4423',
            to: '0x6BF0a403c4e94392613250dbcec9465624b2E28E',
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
            from: '0x6BF0a403c4e94392613250dbcec9465624b2E28E',
            to: '0x2Eb475f013135813D051Fe2E3C781FB565766634',
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
            from: '0x6BF0a403c4e94392613250dbcec9465624b2E28E',
            to: '0x53a5F8D3846bF3a1072bdE70f3A4566C268a4423',
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
        '0xF041690D9cBE398d3D51F25C87902C1403AffE66',
        '0xBE4D9c8C638B5f0864017d7F6A04b66c42953847',
        '0x5988A46C633A2beA1a8104F8eaDa5b4629fc2e78'
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
