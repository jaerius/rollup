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
import { RLP, keccak256, sha256,  toUtf8Bytes } from 'ethers/lib/utils';

class OptimisticRollup {
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
        this.setupEventListeners();
        
    }

    ///snap shot
    async saveSnapshot(transactionIndex: string, snapshot: any): Promise<void> {
        const key = `snapshot:${transactionIndex}`;
        await this.db.put(key, snapshot);
        console.log(`Saved snapshot at key: ${key}`);
    }

    private setupEventListeners() {
        this.l1Contract.on('BatchInvalidated', async (batchIndex: number) => {
            await this.handleBatchInvalidation(batchIndex);
        });
    }

    private async handleBatchInvalidation(invalidatedBatchIndex: number) {
        const latestValidBatch = await this.l1Contract.getLatestValidBatch();
        const transactionsToReapply = await this.getTransactionsAfterBatch(latestValidBatch);
        this.revertToState(latestValidBatch);
        for (const tx of transactionsToReapply) {
            await this.reapplyTransaction(tx);
        }
        await this.processBatch([]);
    }

    private async getTransactionsAfterBatch(batchIndex: number): Promise<SignedTransaction[]> {
        const transactions: SignedTransaction[] = [];
        const currentBatchCount = await this.l1Contract.getBatchCount();

        for (let i = batchIndex + 1; i < currentBatchCount; i++) {
            const batchData = await this.l1Contract.getBatch(i);
            if (batchData.valid) {
                const decodedTransactions = this.decodeBatchData(batchData.batchData);
                transactions.push(...await decodedTransactions);
            }
        }

        return transactions;
    }

    private async revertToState(batchIndex: number) {
        const snapshot = await this.getSnapshotAtBatch(batchIndex);
        this.accounts = snapshot.accounts;
        this.blocks[Number(this.currentBlockNumber)].stateRoot = snapshot.stateRoot;
    }

    private async reapplyTransaction(tx: SignedTransaction): Promise<void> {
        const fromAccount = this.accounts.get(tx.from) || { balance: BigInt(0), nonce: BigInt(0) };
        fromAccount.balance -= tx.amount;
        fromAccount.nonce += BigInt(1);
        this.accounts.set(tx.from, fromAccount);

        const toAccount = this.accounts.get(tx.to) || { balance: BigInt(0), nonce: BigInt(0) };
        toAccount.balance += tx.amount;
        this.accounts.set(tx.to, toAccount);
    }

    private async getSnapshotAtBatch(batchIndex: number): Promise<any> {
        const state = await this.db.get(`snapshot:${batchIndex}`);
        return {
            accounts: new Map(JSON.parse(state).accounts),
            stateRoot: JSON.parse(state).stateRoot
        };
    }

    private async getLatestSnapshotInfo(): Promise<{ key: string; blockNumber: bigint }> {
        if (!this.previousSnapshotKey) {
            return { key: '', blockNumber: BigInt(0) };
        }
        const snapshotData = JSON.parse(await this.db.get(this.previousSnapshotKey));
        return {
            key: this.previousSnapshotKey,
            blockNumber: BigInt(snapshotData.blockNumber)
        };
    }

    // verifier가 틀렸는지 안 틀렸는지 검증
    async verifyBatch(batchId: string): Promise<void> {
        console.log("verifyBatch batchId:", batchId); 
        const batch = await this.l1Contract.getBatchByBatchId(batchId);
        console.log("verifyBatch batch:", batch)
        const transactions: SignedTransaction[] = await this.decodeBatchData(batch.batchData);
        console.log("verifyBatch transactions:", transactions);
        // 배치 시작 시 초기 상태 루트 설정
        let previousStateRoot = await this.l1Contract.getPreviousStateRoot(batchId);
        console.log(previousStateRoot, "previousStateRoot")
        
        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];

            // 트랜잭션 실행 후 상태 루트 계산 (시뮬레이션)
            this.reapplyTransaction(tx);
            const computedStateRoot = this.computeStateRoot();

            // 예상 상태 루트와 비교
            const expectedStateRoot = await this.db.get(`stateRoot:${tx.hash}`);
            if (expectedStateRoot !== computedStateRoot) {
                const leaves = transactions.map(tx => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(tx))));
                const merkleTree = MerkleTree.buildMerkleTree(leaves);
                const root = merkleTree[merkleTree.length - 1][0];
                const proof = MerkleTree.generateMerkleProof(merkleTree, i);
                await this.challenge(batchId, tx.hash, proof);
                return;
            }

            previousStateRoot = computedStateRoot;
        }

        console.log('Batch verification successful');
    }

    async challenge(batchId: string, transactionIndex: string, proof: string[]): Promise<void> {
       
        console.log(`Challenging batch ${batchId}, transaction ${transactionIndex} due to ${proof}`);
        await this.verifierContract.initiateChallenge(batchId, transactionIndex, proof);
    }


    private async decodeBatchData(compressedData: string): Promise<SignedTransaction[]> {
       // Hex 디코딩
       const hexDecodedData = ethers.utils.arrayify(compressedData);
       console.log("Hex decoded data:", hexDecodedData);

       // UTF-8 바이트 배열로 변환
       const utf8Data = ethers.utils.toUtf8String(hexDecodedData);
       console.log("UTF-8 data:", utf8Data);

       // Base64 디코딩
       const base64DecodedData = Buffer.from(utf8Data, 'base64');
       console.log("Base64 decoded data:", base64DecodedData);

        // const isGzip = (buffer: Buffer) => {
        //     return buffer[0] === 0x1f && buffer[1] === 0x8b;
        // };

        // if (!isGzip(buffer)) {
        //     throw new Error("Data is not in gzip format.");
        // }
        try {
            const decompressedData = await new Promise<Buffer>((resolve, reject) => {
                zlib.gunzip(base64DecodedData, (error, result) => {
                    if (error) {
                        console.error("Gunzip error:", error);
                        reject(error);
                    } else {
                        console.log("gunzip result (Buffer):", result);
                        resolve(result);
                    }
                });
            });
    
            const rlpEncodedBatch = decompressedData.toString('utf-8');
            console.log("RLP encoded batch:", rlpEncodedBatch);
    
            // 첫 번째 RLP 디코딩: 트랜잭션 목록 추출
            const decodedBatch = ethers.utils.RLP.decode(rlpEncodedBatch);
    
            // 트랜잭션 목록에서 각각의 트랜잭션을 다시 디코딩
            const transactions: SignedTransaction[] = (decodedBatch as string[]).map(this.decodeTransaction);
    
            return transactions;
        } catch (err) {
            console.error("Decompression error:", err);
            throw err;
        }
    }

    decodeTransaction(rlpEncodedTx: string): SignedTransaction {
        const decoded = ethers.utils.RLP.decode(rlpEncodedTx);
    
        // 트랜잭션 객체 생성
    const tx: SignedTransaction = {
        from: decoded[0],
        to: decoded[1],
        amount: BigInt(ethers.BigNumber.from(decoded[2]).toString()),
        nonce: BigInt(ethers.BigNumber.from(decoded[3]).toString()),
        fee: BigInt(ethers.BigNumber.from(decoded[4]).toString()),
        gasPrice: BigInt(ethers.BigNumber.from(decoded[5]).toString()),
        gasLimit: BigInt(ethers.BigNumber.from(decoded[6]).toString()),
        chainId: Number(ethers.BigNumber.from(decoded[7])),
        v: Number(ethers.BigNumber.from(decoded[8])),
        r: decoded[9],
        s: decoded[10],
        data: decoded[11],
        hash: ''
    };

    // 서명 전 필드만 포함한 트랜잭션 데이터 객체
    const txData = {
        nonce: Number(tx.nonce),
        gasPrice: ethers.utils.hexlify(tx.gasPrice),
        gasLimit: ethers.utils.hexlify(tx.gasLimit),
        to: tx.to,
        value: ethers.utils.hexlify(tx.amount),
        data: tx.data,
        chainId: tx.chainId
    };

    // 트랜잭션 직렬화
    const serializedTx = ethers.utils.serializeTransaction(txData);
    console.log("Serialized transaction:", serializedTx);

    // 트랜잭션 해시 계산
    tx.hash = ethers.utils.keccak256(serializedTx);
    console.log("Transaction hash:", tx.hash);

    return tx;
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

    async addTransaction(tx: Transaction, signer: ethers.Signer): Promise<void> {
        const signedTx = await this.signTransaction(tx, signer);
        if (await this.verifyTransaction(signedTx.signedTx, signedTx.sig)) {
            this.pendingTransactions.push(signedTx.signedTx);
        } else {
            throw new Error("Transaction verification failed");
        }
    }

    public async signTransaction(tx: Transaction, signer: ethers.Signer): Promise<{ signedTx: SignedTransaction; sig: any }> {
        const txData = {
            nonce: Number(tx.nonce),
            gasPrice: ethers.utils.hexlify(tx.gasPrice),
            gasLimit: ethers.utils.hexlify(tx.gasLimit),
            to: tx.to,
            value: ethers.utils.hexlify(tx.amount),
            data: tx.data,
            chainId: tx.chainId || 1
        };
    
        const signedTx = await signer.signTransaction(txData); //sign message말고, transactino으로 했더니 됨
        const parsedTx = ethers.utils.parseTransaction(signedTx);

        const messageHash = ethers.utils.keccak256(ethers.utils.serializeTransaction(txData));
    
        let v = parsedTx.v!;
        if (v >= 37) {
            v = v - (2 * txData.chainId + 8);  // Adjust v value for EIP-155
        }

        console.log('서명된 트랜잭션 데이터:', txData);

        return {
            signedTx: {
                ...tx,
                v: v,
                r: parsedTx.r!,
                s: parsedTx.s!,
                hash: messageHash
            },
            sig: {
                v: v,
                r: parsedTx.r!,
                s: parsedTx.s!
            }
        };
    }

    public async verifyTransaction(tx: SignedTransaction, sig: any): Promise<boolean> {
        const txData  = {
            nonce: Number(tx.nonce),
            gasPrice: ethers.utils.hexlify(tx.gasPrice),
            gasLimit: ethers.utils.hexlify(tx.gasLimit),
            to: tx.to,
            value: ethers.utils.hexlify(tx.amount),
            data: tx.data,
            chainId: tx.chainId || 1,
        };
    
        const serializedTx = ethers.utils.serializeTransaction({
            nonce: txData.nonce,
            gasPrice: txData.gasPrice,
            gasLimit: txData.gasLimit,
            to: txData.to,
            value: txData.value,
            data: txData.data,
            chainId: txData.chainId
        });
        const messageHash = ethers.utils.keccak256(serializedTx);

        let v = sig.v;
        if (v >= 37) {
            v = v - (2 * txData.chainId + 8);  // Adjust v value for EIP-155
        }

        console.log("검증된 트랜잭션 데이터:", txData);

        const recoveredAddress = ethers.utils.recoverAddress(messageHash, { v, r: sig.r, s: sig.s });

        // 메시지는 위조되지 않았나? 검증
        if(tx.hash == messageHash) {
            console.log("message is not forged");
        }
    
        console.log("Recovered address:", recoveredAddress); // 보낸 사람이 정말 서명한 사람인가? 검증
        console.log("Original from address:", tx.from);
    
        // 서명자 일치 확인 및 메시지 위조 여부 모두 담은 결과 반환해야함
        return recoveredAddress.toLowerCase() === tx.from.toLowerCase();
    }


    async processBatch(proposers: string[]): Promise<string> {
        
        this.executePendingTransactions();
        console.log("execute transactions", this.pendingTransactions)

        const stateRoot = this.computeStateRoot();
        console.log("stateRoot", stateRoot)

        const transactionRoot = this.computeTransactionRoot(this.pendingTransactions);
        console.log("transactionRoot", transactionRoot)

        const previousBlockHash = this.blocks.length > 0 ? this.blocks[this.blocks.length - 1].blockHash : ethers.constants.HashZero;
        console.log('previousBlockHash before creating new block:', previousBlockHash);
        const timestamp = Date.now();
        const calldata = this.encodeBatchData(this.pendingTransactions);
        console.log("encoded calldata:", calldata);

        const compressedCalldata = await this.gzipCompress(calldata);
        console.log("compressedCalldata (Base64):", compressedCalldata);

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
        
        const firstResult = await Promise.all(miningPromises);
        const bestResult = firstResult.reduce((prev, current) => prev.nonce < current.nonce ? prev : current);
        console.log("bestResult", bestResult)

        const batchId = ethers.utils.keccak256(ethers.utils.randomBytes(32));
        const batchData = { proposer: bestResult.proposer, timestamp, calldata: compressedCalldata, batchId };
        
        const snapshotKey = `snapshot:${batchId}`;
        await this.db.put(snapshotKey, JSON.stringify({
            timestamp,
            blockNumber: this.currentBlockNumber.toString(),
            stateRoot,
            previousSnapshotKey: this.previousSnapshotKey
        }));
        this.previousSnapshotKey = snapshotKey;
        console.log("batchData", batchData)

        newBlock.blockHash = this.computeBlockHash(previousBlockHash, stateRoot, newBlock.blockNumber, newBlock.timestamp, newBlock.transactions, BigInt(bestResult.nonce));
        newBlock.nonce = BigInt(bestResult.nonce);

        this.blocks.push(newBlock);
        this.chain.addBlock(newBlock);
        this.currentBlockNumber = newBlock.blockNumber + BigInt(1);
        console.log("newBlock before submit", newBlock)

        await this.submitBatch(batchData, stateRoot, transactionRoot);
        this.pendingTransactions = [];

        return batchId
    }

    private async gzipCompress(data: string): Promise<string> {
        return new Promise((resolve, reject) => {
            zlib.gzip(data, (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    console.log("gzipCompress result (Buffer):", result); // 디버깅 로그 추가
                    const base64Result = result.toString('base64');
                    console.log("gzipCompress result (Base64):", base64Result); // 디버깅 로그 추가
                    resolve(base64Result); // Base64 인코딩
                }
            });
        });
    }

    private executePendingTransactions(): void {
        this.pendingTransactions.forEach(tx => {
            this.updateAccountState(tx);
        });
    }

    private encodeBatchData(batch: SignedTransaction[]): string {
        const encodedTx = batch.map(tx => {
            if (tx.amount < 0 || tx.nonce < 0) {
                throw new Error(`Invalid transaction: amount or nonce is negative. Amount: ${tx.amount}, Nonce: ${tx.nonce}`);
            }
    
            // BigInt 값을 바이트 배열로 변환
            const amountBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.amount.toString()));
            const nonceBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.nonce.toString()));
            const feeBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.fee.toString()));
            const gasPriceBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.gasPrice.toString()));
            const gasLimitBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.gasLimit.toString()));
            const chainIdBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.chainId));
            const v = ethers.utils.arrayify(ethers.BigNumber.from(tx.v));

            const rlpEncoded = ethers.utils.RLP.encode([
                tx.from,
                tx.to,
                amountBytes,
                nonceBytes,
                feeBytes,
                gasPriceBytes,
                gasLimitBytes,
                chainIdBytes,
                v,
                tx.r,
                tx.s,
                tx.data
            ]);
            return rlpEncoded;
            });
    
        const encodedBatch = ethers.utils.RLP.encode(encodedTx);
        return encodedBatch;
    }
    

    private async submitBatch(batch: Batch, stateRoot: string, transactionRoot: string): Promise<void> {
        try {
            const signer = this.l1Contract.signer;
            if (!signer) {
                throw new Error("L1 Contract requires a signer");
            }
            const hexlifiedCalldata = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(batch.calldata));

           
            // const ctcGasEstimate = await this.ctcContract.estimateGas.appendTransactionBatch(hexlifiedCalldata);
            // const ctcTx = await this.ctcContract.appendTransactionBatch(hexlifiedCalldata,{
            //     gasLimit: ctcGasEstimate
            // });
            // await ctcTx.wait();
            // console.log(`Transaction batch submitted to CTC`);
            // this.ctcContract.on('TransactionBatchAppended', (hexlifiedCalldata) => {
            //     console.log(`TransactionBatchAppended event detected: calldata = ${hexlifiedCalldata}`);
            // });
            

            const sccGasEstimate = await this.l1Contract.estimateGas.appendStateBatch(hexlifiedCalldata, stateRoot, transactionRoot, batch.proposer, batch.batchId);
            const sccTx = await this.l1Contract.appendStateBatch(hexlifiedCalldata, stateRoot, transactionRoot, batch.proposer, batch.batchId, {
                gasLimit: sccGasEstimate
            });
            await sccTx.wait();
            console.log(`State batch submitted with state root: ${stateRoot}`);

            this.l1Contract.on('StateBatchAppended', (batchIndex, calldata, stateRoot, proposer, batchId) => {
                console.log(`StateBatchAppended event detected: batchIndex = ${batchIndex}, calldata = ${calldata} stateRoot = ${stateRoot}, proposer = ${proposer}, batchId = ${batchId}`);
            });

        } catch (error) {
            console.error('Error submitting batch:', error);
            if (error.data && error.data.message) {
                console.error('Revert reason:', error.data.message);
            }
        }
    }

    private async updateAccountState(tx: SignedTransaction & { nonce: bigint }): Promise<void> {
        if (tx.amount < 0 || tx.nonce < 0) {
            throw new Error(`Invalid transaction: amount or nonce is negative. Amount: ${tx.amount}, Nonce: ${tx.nonce}`);
        }
       
        const fromAccount = this.accounts.get(tx.from) || { balance: BigInt(0), nonce: BigInt(0) };
        if (fromAccount.balance < tx.amount) {
            throw new Error(`Insufficient balance. Account: ${tx.from}, Balance: ${fromAccount.balance}, Amount: ${tx.amount}`);
        }
        console.log("tx전",fromAccount.balance, tx.amount, tx.nonce)
    
        fromAccount.balance -= tx.amount;
        fromAccount.nonce += BigInt(1);
        this.accounts.set(tx.from, fromAccount);

        console.log("tx후",fromAccount.balance, tx.amount, tx.nonce)
    
        const toAccount = this.accounts.get(tx.to) || { balance: BigInt(0), nonce: BigInt(0) };
        toAccount.balance += tx.amount;
        this.accounts.set(tx.to, toAccount);

        const stateRoot = this.computeStateRoot();
        await this.db.put(`stateRoot:${tx.hash}`, stateRoot);
        console.log("stateroot", stateRoot)
        const check = await this.db.get(`stateRoot:${tx.hash}`);
        console.log("newcheck",check)
        
         // BigInt 값을 문자열로 변환하여 JSON 직렬화
        const txLog = {
            ...tx,
            gasPrice: tx.gasPrice.toString(),
            gasLimit: tx.gasLimit.toString(),
            fee : tx.fee.toString(),
            amount: tx.amount.toString(),
            nonce: tx.nonce.toString()
        };
        const snap1 = await this.db.put(`txLog:${tx.hash}`, JSON.stringify(txLog)); 
        const snap2 = await this.db.get(`txLog:${tx.hash}`);
        console.log("snap2", snap2)
        const snap = await this.saveSnapshot(tx.hash, JSON.stringify(txLog) )
        console.log(snap, "snap")
        }

    private computeStateRoot(): string {
        const leaves = Array.from(this.accounts.entries()).map(([address, account]) => {
            const balanceBytes = ethers.utils.arrayify(ethers.BigNumber.from(account.balance.toString()).toHexString());
            const nonceBytes = ethers.utils.arrayify(ethers.BigNumber.from(account.nonce.toString()).toHexString());
    
            const encodedAccount = ethers.utils.RLP.encode([
                address,
                balanceBytes,
                nonceBytes
            ]);
            return ethers.utils.keccak256(encodedAccount);
        });
    
        const merkleTree = MerkleTree.buildMerkleTree(leaves);
        return merkleTree[merkleTree.length - 1][0];
    }
    

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

    getBalance(address: string): bigint {
        return this.accounts.get(address)?.balance || BigInt(0);
    }

    deposit(address: string, amount: bigint): void {
        const account = this.accounts.get(address) || { balance: BigInt(0), nonce: BigInt(0) };
        account.balance += amount;
        this.accounts.set(address, account);
    }

    // private async verifyBatch(batchId: string): Promise<void> {
    //     const snapshotKey = `snapshot:${batchId}`;
    //     const snapshot = JSON.parse(await this.db.get(snapshotKey));        
    //     if (!snapshot) {
    //         throw new Error(`Snapshot not found for batch ID: ${batchId}`);
    //     }

    //     const previousSnapshotKey = snapshot.previousSnapshotKey;
    //     const previousSnapshot = previousSnapshotKey ? JSON.parse(await this.db.get(previousSnapshotKey)) : null;
        
    //     let stateRoot = previousSnapshot ? previousSnapshot.stateRoot : ethers.constants.HashZero;
    //     const txLogs = [];
    //     const stateRoots = [];

    //     let currentBlockNumber = previousSnapshot ? previousSnapshot.blockNumber + 1 : 0;
    //     while (currentBlockNumber <= snapshot.blockNumber) {
    //         const blockData = this.blocks[currentBlockNumber];
    //         for (const tx of blockData.transactions) {
    //             const txLog = JSON.parse(await this.db.get(`txLog:${tx.hash}`));
    //             txLogs.push(txLog);
    //             const stateRoot = await this.db.get(`stateRoot:${tx.hash}`);
    //             stateRoots.push(stateRoot);
    //         }
    //         currentBlockNumber++;
    //     }

    //     const leaves = txLogs.map(tx => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(tx))));
    //     const merkleTree = MerkleTree.buildMerkleTree(leaves);
    //     const root = merkleTree[merkleTree.length - 1][0];

    //     for (let i = 0; i < txLogs.length; i++) {
    //         const txLog = txLogs[i];
    //         const expectedStateRoot = stateRoots[i];

    //         this.applyTransaction(txLog);
    //         const computedStateRoot = this.computeStateRoot();
    //         let previousStateRoot : string = '0x';
    //         if (computedStateRoot !== expectedStateRoot) {
    //             const proof = MerkleTree.generateMerkleProof(merkleTree, i);
    //             await this.bondManagerContract.deposit();
    //             await this.verifierContract.initiateChallenge(batchId, i, proof);

    //             console.log(`Challenge submitted for batch ${batchId}, transaction index ${i}`);
    //             return;
    //         } else {
    //             previousStateRoot = computedStateRoot;
    //         }
    //     }

    //     console.log(`Batch ${batchId} verification successful`);
    // }

    private async reapplyTransactions(transactions: SignedTransaction[]): Promise<void> {
        for (const tx of transactions) {
            await this.updateAccountState(tx);
        }
    }
}

export default OptimisticRollup;