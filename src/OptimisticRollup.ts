import { Level } from 'level';
import { ethers } from 'ethers';
import zlib from 'zlib';
import { promisify } from 'util';
import { Block, BlockData } from './models/Block';
import { Blockchain } from './models/BlockChain';
import POW from './models/pow';
import MerkleTree from './utils/MerkleTree';
import { Batch } from './interfaces/Batch';
import { ctcBatch } from './interfaces/Batch';
import { SignedTransaction, Transaction } from './interfaces/Transaction';
import contract from './contracts/StateCommitmentChain';
import FraudVerifierContract from './contracts/FraudVerifier';
import BondManagerContract from './contracts/BondManager';
import ctcContract from './contracts/CanonicalTransactionChain';
import { RLP, keccak256, serializeTransaction, sha256,  toUtf8Bytes } from 'ethers/lib/utils';
import TransactionService from './services/TransactionService';
import StateService from './services/StateService';


class OptimisticRollup {
    once(arg0: string, arg1: (batchIndex: any, batchData: any, stateRoot: any, transactionsRoot: any, proposer: any, appendedBatchId: any) => void) {
        throw new Error('Method not implemented.');
    }
    public pendingTransactions: SignedTransaction[] = [];
    private accounts: Map<string, { balance: bigint, nonce: bigint }> = new Map();
    public l1Contract: ethers.Contract;
    public verifierContract: ethers.Contract;
    public bondManagerContract: ethers.Contract;
    public ctcContract: ethers.Contract;
    private blocks: Block[] = [];
    private currentBlockNumber: bigint = BigInt(0);
    private pow: POW;
    private chain: Blockchain;
    public db: Level;
    public previousSnapshotKey: string = '';
    private stateRoot: string;
    private transactionService: TransactionService;
    private stateService: StateService;
    private invalidTransactionHashes: Set<string> = new Set();

    constructor(difficulty: number) {
        this.l1Contract = contract;
        this.verifierContract = FraudVerifierContract;
        this.bondManagerContract = BondManagerContract;
        this.ctcContract = ctcContract;

        const genesisBlockData: BlockData = {
            transactions: [],
            stateRoot: ethers.constants.HashZero,
            blockNumber: BigInt(0),
            previousBlockHash: ethers.constants.HashZero,
            timestamp: Date.now(),
            blockHash: this.computeBlockHash(ethers.constants.HashZero, ethers.constants.HashZero, BigInt(0), Date.now(), [], BigInt(0)),
            nonce: BigInt(0),
            batchData: ''
        };
        const genesisBlock = new Block(genesisBlockData);
        this.blocks.push(genesisBlock);

        this.pow = new POW(difficulty, genesisBlock);
        this.chain = new Blockchain();
        this.chain.addBlock(genesisBlock);
        this.currentBlockNumber = BigInt(1);
        this.db = new Level('./db', { valueEncoding: 'json' });
        this.stateRoot = ethers.constants.HashZero;
        this.transactionService = new TransactionService();
        this.stateService = new StateService(this.db);
        this.setupEventListeners();
        
    }

    // challenge, rollback 관련 함수들 작업 필요

    private setupEventListeners() {
        this.l1Contract.on('BatchInvalidated', async (batchIndex: number, txHash: string) => {
            this.invalidTransactionHashes.add(txHash);
            await this.handleBatchInvalidation(batchIndex);
        });

        // this.verifierContract.on('ChallengeInitiated', async (batchId: string, challenger: string, txHash: string) => {
        //     console.log(`Challenge initiated for batch ${batchId}`);
        //     await this.resolveChallenge(batchId);
        // });
    
        this.verifierContract.on('ChallengeResolved', async (batchId: string, success: boolean, proposer: string) => {
            console.log(`Challenge resolved for batch ${batchId}. Success: ${success}`);
            if (!success) {
                const batch = await this.l1Contract.getBatchByBatchId(batchId);
                await this.handleBatchInvalidation(batch.batchIndex);
            }
        });
    }

    private async handleBatchInvalidation(invalidatedBatchIndex: number) {

        const latestValidBatch = await this.l1Contract.getLatestValidBatch();

        // 여기에서 LastestValidBatch의 previousState를 알아야함
        // 다시 그 previousState를 가지고 invalidate trnasaction을 제외한 배치를 다시 실행해야함
        // 그러면 컨트랙트에서 invalidate된 트랜잭션들을 데이터 베이스에 저장, 그리고 여기서 다시 가져와서 실행
        // 그런데 굳이 다시 가져오지 않더라도, 데이터 베이스에서 배치 index와 트랜잭션 index를 가지고 찾아서 해당 배치 및 다음 배치를 실행시키면 되겠네
        // 그러면 이전 상태를 가져와서 다시 실행시키는 것이 아니라, invalidate된 트랜잭션을 제외한 배치를 다시 실행시키면 되겠네

        // 
        const previousStateRoot = latestValidBatch.stateRoot;


        const transactionsToReapply = await this.getTransactionsAfterBatch(latestValidBatch);
        await this.stateService.revertToState(latestValidBatch);
        for (const tx of transactionsToReapply) {
            await this.reapplyTransaction(tx);
        }
        await this.processBatch([]);
    }

    private async getTransactionsAfterBatch(batchIndex: number): Promise<SignedTransaction[]> {
        // const transactions: SignedTransaction[] = [];
        const currentBatchCount = await this.l1Contract.getBatchCount();

        for (let i = batchIndex; i < currentBatchCount; i++) {
            const batchData = await this.l1Contract.getBatch(i);
            if (!batchData.valid) { // 배치가 유효하지 않으면서
                const decodedTransactions = await this.transactionService.decodeBatchData(batchData.batchData);
                for (const tx of decodedTransactions) { // 트랜잭션에 tx가 invalid하지 않은 것 배열에 추가
                    if (!this.invalidTransactionHashes.has(tx.hash)) {
                        this.pendingTransactions.unshift(tx); // pendingTransactions에 넣어야 할 것 같다. 제일 앞에 어떻게 넣을까?
                    }
                } 
                }
            }
        

        return this.pendingTransactions;
    }

    private async reapplyTransaction(tx: SignedTransaction) {
        // 트랜잭션을 재적용하여 상태를 업데이트하는 로직 구현
        const account = this.accounts.get(tx.from);
        if (account) {
            account.nonce += BigInt(1);
            account.balance -= tx.amount + tx.fee;
    
            // 음수 값이 발생하지 않도록 처리
            if (account.balance < 0) {
                throw new Error(`Invalid balance for account ${tx.from}: ${account.balance}`);
            }
            if (account.nonce < 0) {
                throw new Error(`Invalid nonce for account ${tx.from}: ${account.nonce}`);
            }
    
            this.accounts.set(tx.from, account);
        }
    
        const recipient = this.accounts.get(tx.to) || { balance: BigInt(0), nonce: BigInt(0) };
        recipient.balance += tx.amount;
    
        // 음수 값이 발생하지 않도록 처리
        if (recipient.balance < 0) {
            throw new Error(`Invalid balance for account ${tx.to}: ${recipient.balance}`);
        }
        if (recipient.nonce < 0) {
            throw new Error(`Invalid nonce for account ${tx.to}: ${recipient.nonce}`);
        }
    
        this.accounts.set(tx.to, recipient);
    
        // 상태 루트를 업데이트
        this.stateRoot = this.stateService.computeStateRoot();
    }

    

    private setStateRoot(stateRoot: string) {
        this.stateRoot = stateRoot;
    }

    // verifier가 틀렸는지 안 틀렸는지 검증
    async verifyBatch(batchId: string): Promise<void> {
        console.log("verifyBatch batchId:", batchId); 
        const batch = await this.l1Contract.getBatchByBatchId(batchId);
        console.log("verifyBatch batch:", batch)
        const transactions: SignedTransaction[] = await this.transactionService.decodeBatchData(batch.batchData);
        console.log("verifyBatch transactions:", transactions);
        // 배치 시작 시 초기 상태 루트 설정
        let previousStateRoot;
        try {
            previousStateRoot = await this.l1Contract.getPreviousStateRoot(batchId); // 잘 작동!
            console.log("Previous State Root:", previousStateRoot);
        } catch (error) {
            console.error("Error fetching Previous State Root:", error);
            return;
        }

        this.setStateRoot(previousStateRoot);
        console.log("Previous State Root set:", this.stateRoot);
        
        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            console.log(`Processing transaction ${tx.hash}:`, tx);

            try {
                // state되돌려야 함
                console.log("batchIndex:", Number(batch.batchIndex))
                await this.stateService.revertToState(Number(batch.batchIndex - 1));
                await this.reapplyTransaction(tx);
                
                const computedStateRoot = this.stateService.computeStateRoot(); // 전체 acoount에 대한 stateRoot 검증이므로 다른 로직이 필요
                console.log(`Computed State Root for transaction ${tx.hash}:`, computedStateRoot);
                
                // 예상 상태 루트와 비교
                console.log("Expected State Root for transaction:", tx.hash);
                const expectedStateRoot = await this.db.get(`stateRoot:${tx.hash}`); // 여기서는 첫 트랜잭션 하나에 대한 stateRoot불러와서 다르게 나옴
                console.log(`Expected State Root for transaction ${tx.hash}:`, expectedStateRoot);
        
                if (expectedStateRoot !== computedStateRoot) {
                    const leaves = transactions.map(tx => {
                        console.log(`Transaction ${i} data for keccak256:`, tx);
    
                        const encodedTx = ethers.utils.RLP.encode([
                            ethers.utils.hexlify(ethers.BigNumber.from(tx.nonce)),      // nonce
                            ethers.utils.hexlify(ethers.BigNumber.from(tx.gasPrice)),   // gasPrice
                            ethers.utils.hexlify(ethers.BigNumber.from(tx.gasLimit)),   // gasLimit
                            tx.to,                                                     // to
                            ethers.utils.hexlify(ethers.BigNumber.from(tx.amount)),      // value
                            tx.data,                                                   // data
                            ethers.utils.hexlify(tx.chainId),                           // chainId
                            ethers.utils.hexlify(tx.v),                                 // v
                            tx.r,                                                      // r
                            tx.s                                                       // s
                            ]);
    
                        return ethers.utils.keccak256(encodedTx);
                    });
                    const merkleTree = MerkleTree.buildMerkleTree(leaves);
                    const root = merkleTree[merkleTree.length - 1][0];
                    const proof = MerkleTree.generateMerkleProof(merkleTree, i);
                    console.log(`Computed Merkle Root for transaction ${i}:`, root);
                    await this.challenge(batchId, tx.hash, proof);
                    await this.verifyChallenge(batchId, tx.hash, transactions); // 챌린지 검증
                    return;
                }
        
                previousStateRoot = computedStateRoot;
            } catch (error) {
                console.error(`Error processing transaction ${i}:`, error);
                return;
            }
        }
            console.log('Batch verification successful');
     }

    async challenge(batchId: string, transactionIndex: string, proof: string[]): Promise<void> {
       
        console.log(`Challenging batch ${batchId}, transaction ${transactionIndex} due to ${proof}`);
        await this.bondManagerContract.deposit({ value : ethers.utils.parseEther('1')}); // 보증금 예치
        await this.verifierContract.initiateChallenge(batchId, transactionIndex, proof); // 챌린지 신청
        
    }

    async verifyChallenge(batchId: string, txHash: string, transactions: SignedTransaction[]): Promise<boolean> {
        const challenge = await this.verifierContract.challenges(batchId);
        if (challenge.resolved) {
            console.log("Challenge already resolved");
            return false;
        }
    
       await this.verifierContract.executeFullBatch(batchId, transactions, txHash);
       return ;
    }

    async setChallengePeriod(period: number) {
        try {
            const tx = await this.l1Contract.setChallengePeriod(period);
            await tx.wait();
            console.log('Challenge period set successfully');
        } catch (error) {
            console.error('Error setting challenge period:', error);
        }
    }


    // 배치 관련 함수들


    async processBatch(proposers: string[]): Promise<string> {
        // 1. 트랜잭션 실행
        this.executePendingTransactions();
        console.log("execute transactions", this.pendingTransactions)
        // 2. 상태 루트 계산 -> 이건 이제 배치의 상태 루트가 됨
        const stateRoot = this.stateService.computeStateRoot();
        console.log("stateRoot", stateRoot)
        // 트랜잭션 루트 생성
        const transactionRoot = this.computeTransactionRoot(this.pendingTransactions);
        console.log("transactionRoot", transactionRoot)
         // 3. 배치 생성
        const previousBlockHash = this.blocks.length > 0 ? this.blocks[this.blocks.length - 1].blockHash : ethers.constants.HashZero;
        console.log('previousBlockHash before creating new block:', previousBlockHash);
        const timestamp = Date.now();
        const calldata = this.transactionService.encodeBatchData(this.pendingTransactions);
        console.log("encoded calldata:", calldata);

        const compressedCalldata = await this.gzipCompress(calldata);
        console.log("compressedCalldata (Base64):", compressedCalldata);
        // 새로운 블록 생성
        const blockData: BlockData = {
            transactions: this.pendingTransactions,
            stateRoot,
            blockNumber: this.currentBlockNumber,
            previousBlockHash,
            timestamp,
            blockHash: '',
            nonce: BigInt(0),
            batchData: compressedCalldata.toString()
        };

        const newBlock = new Block(blockData);
        const miningPromises = proposers.map(proposer => this.pow.mine(newBlock, proposer));
        // 가장 논스 값이 적게 든 사용자가 proposer가 됨
        const firstResult = await Promise.all(miningPromises);
        const bestResult = firstResult.reduce((prev, current) => prev.nonce < current.nonce ? prev : current);
        console.log("bestResult", bestResult)
        // 배치 데이터를 직렬화
        const batchId = ethers.utils.keccak256(ethers.utils.randomBytes(32));
        const batchData = { proposer: bestResult.proposer, timestamp, calldata: compressedCalldata, batchId };
        // db에 스냅샷 찍음
        const snapshotKey = `snapshot:${batchId}`;
        await this.db.put(snapshotKey, JSON.stringify({
            timestamp,
            blockNumber: this.currentBlockNumber.toString(),
            stateRoot,
            previousSnapshotKey: this.previousSnapshotKey
        }));
        this.previousSnapshotKey = snapshotKey;
        console.log("batchData", batchData)
        // 블록 관련 연산 및 연결
        newBlock.blockHash = this.computeBlockHash(previousBlockHash, stateRoot, newBlock.blockNumber, newBlock.timestamp, newBlock.transactions, BigInt(bestResult.nonce));
        newBlock.nonce = BigInt(bestResult.nonce);

        this.blocks.push(newBlock);
        this.chain.addBlock(newBlock);
        this.currentBlockNumber = newBlock.blockNumber + BigInt(1);
        console.log("newBlock before submit", newBlock)
        // 배치 제출
        await this.submitBatch(batchData, stateRoot, transactionRoot);
        this.pendingTransactions = [];

        return batchId
    }

    private async submitBatch(batch: Batch, stateRoot: string, transactionRoot: string): Promise<void> {
        try {
            const signer = this.l1Contract.signer;
            if (!signer) {
                throw new Error("L1 Contract requires a signer");
            }

            // 스마트 컨트랙트에서 직접 처리할 수 있는 16진수 문자열로 변환
            const hexlifiedCalldata = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(batch.calldata));
            
            // 가스 추정을 사용하여 가스 한도 설정
            const sccGasEstimate = await this.l1Contract.estimateGas.appendStateBatch(hexlifiedCalldata, stateRoot, transactionRoot, batch.proposer, batch.batchId);
            const sccTx = await this.l1Contract.appendStateBatch(hexlifiedCalldata, stateRoot, transactionRoot, batch.proposer, batch.batchId, {
                gasLimit: sccGasEstimate
            });
            await sccTx.wait();
            console.log(`State batch submitted with state root: ${stateRoot}`);


            // 이벤트 리스너 등록
            this.l1Contract.on('StateBatchAppended', (batchIndex, calldata, stateRoot, proposer, batchId) => {
                console.log(`StateBatchAppended event detected: batchIndex = ${batchIndex}, calldata = ${calldata} stateRoot = ${stateRoot}, proposer = ${proposer}, batchId = ${batchId}`);
                this.stateService.saveSnapshotForBatch(batchIndex)
            });

            

        } catch (error) {
            console.error('Error submitting batch:', error);
            if (error.data && error.data.message) {
                console.error('Revert reason:', error.data.message);
            }
        }
    }

    // 헬퍼 함수들

    // pendingTransactions 배열에 트랜잭션 추가
    async addTransaction(tx: Transaction, signer: ethers.Signer): Promise<void> {
        
        const signedTx = await this.transactionService.signTransaction(tx, signer);
        if (await this.transactionService.verifyTransaction(signedTx.signedTx, signedTx.sig)) {
            this.pendingTransactions.push(signedTx.signedTx);
        } else {
            throw new Error("Transaction verification failed");
        }
    }

    // 트랜잭션 대기 배열 실행
    private executePendingTransactions(): void {
        this.pendingTransactions.forEach(tx => {
            this.stateService.updateAccountState(tx);
        });
    }

    // 트랜잭션 루트 계산, RLP 사용해야함
    private computeTransactionRoot(transactions: SignedTransaction[]): string { 
        const leaves = transactions.map(tx => ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                ['address', 'address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
                [tx.from, tx.to, tx.amount, tx.nonce, tx.v, tx.r, tx.s]
            )
        ));

        const merkleTree = MerkleTree.buildMerkleTree(leaves);
        return merkleTree[merkleTree.length - 1][0];
    }

    private computeBlockHash(
        previousBlockHash: string,
        stateRoot: string,
        blockNumber: bigint,
        timestamp: number,
        transactions: SignedTransaction[],
        nonce: bigint
    ): string {
        if (!ethers.utils.isHexString(previousBlockHash, 32)) {
            throw new Error(`Invalid previousBlockHash: ${previousBlockHash}`);
        }
        if (!ethers.utils.isHexString(stateRoot, 32)) {
            throw new Error(`Invalid stateRoot: ${stateRoot}`);
        }
        if (typeof blockNumber !== 'bigint') {
            throw new Error(`Invalid blockNumber: ${blockNumber}`);
        }
        if (typeof timestamp !== 'number') {
            throw new Error(`Invalid timestamp: ${timestamp}`);
        }
        if (typeof nonce !== 'bigint') {
            throw new Error(`Invalid nonce: ${nonce}`);
        }

        const transactionsData = ethers.utils.defaultAbiCoder.encode(
            ['tuple(address from, address to, uint256 amount, uint256 nonce, uint8 v, bytes32 r, bytes32 s)[]'],
            [transactions.map(tx => [tx.from, tx.to, tx.amount, tx.nonce, tx.v, tx.r, tx.s])]
        );

        const blockData = ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'bytes32', 'uint256', 'uint256', 'bytes', 'uint256'],
            [previousBlockHash, stateRoot, blockNumber, timestamp, transactionsData, nonce]
        );

        const blockHash = ethers.utils.keccak256(blockData);
        return blockHash;
    }

    // 배치 데이터를 압축
    private async gzipCompress(data: string): Promise<string> {
        return new Promise((resolve, reject) => {
            zlib.gzip(data, (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    console.log("gzipCompress result (Buffer):", result); 
                    const base64Result = result.toString('base64');
                    console.log("gzipCompress result (Base64):", base64Result); 
                    resolve(base64Result); // Base64 인코딩
                }
            });
        });
    }

    // 자산 관련 함수

    getBalance(address: string): bigint { // stateService로 옮길 예정
        return this.accounts.get(address)?.balance || BigInt(0);
    }

    deposit(address: string, amount: bigint): void {
        this.stateService.deposit(address, amount);
    }

    
}

export default OptimisticRollup;