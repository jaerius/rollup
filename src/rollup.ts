import { ethers } from 'ethers';
import { sha256,  toUtf8Bytes } from 'ethers/lib/utils';
import fs from 'fs';
// import { Blockchain } from './class';
//import { POW } from './pow';

const abiPath = './build/contracts/StateCommitmentChain.json';

const contractJson = JSON.parse(require('fs').readFileSync(abiPath, 'utf8'));
const contractABI = contractJson.abi;
const contractAddress = contractJson.networks['1719350466004'].address;
//"0x1D7271C99C34Cf103f693ff4D0Db3B9661cBc1e2"
const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
// 서명자 설정
const signer = provider.getSigner();

// 스마트 계약 인스턴스 생성
const contract = new ethers.Contract(contractAddress, contractABI, signer);

interface UnsignedTransaction { // 트랜잭션 기본 구성 필드
    to: string;
    amount: bigint;
    fee: bigint;
    nonce: bigint;
    data: string;
    gasPrice: bigint;
    gasLimit: bigint;
    chainId: number;
}

interface Transaction extends UnsignedTransaction { // 트랜잭션 검증용 필드
    from: string;
    hash: string;
}

interface SignedTransaction extends Transaction { // 서명 이후 추가되는 필드
    v: number;
    r: string;
    s: string;
}

interface Batch {
    proposer: string;
    timestamp: number;
    calldata: string;
}

export interface BlockData {
    transactions: SignedTransaction[];
    stateRoot: string;
    blockNumber: bigint;
    previousBlockHash: string;
    timestamp: number;
    blockHash: string;
    nonce: bigint;
    batchData: string;
}

export class Block {
    public transactions: SignedTransaction[];
    public stateRoot: string;
    public blockNumber: bigint;
    public previousBlockHash: string;
    public timestamp: number;
    public blockHash: string;
    public nonce: bigint;
    public batchData: string;

    constructor(blockData: BlockData) {
        this.transactions = blockData.transactions;
        this.stateRoot = blockData.stateRoot;
        this.blockNumber = blockData.blockNumber;
        this.previousBlockHash = blockData.previousBlockHash;
        this.timestamp = blockData.timestamp;
        this.blockHash = blockData.blockHash;
        this.nonce = blockData.nonce;
        this.batchData = blockData.batchData;

        console.log("Block created with data:", {
            transactions: this.transactions,
            stateRoot: this.stateRoot,
            blockNumber: this.blockNumber,
            previousBlockHash: this.previousBlockHash,
            timestamp: this.timestamp,
            nonce: this.nonce,
            batchData: this.batchData,
            blockHash: this.blockHash
        });
    }
   

}

export class Blockchain {
    private chain: Block[];

    constructor() {
        this.chain = [];
    }

    public addBlock(block: Block): void {
        this.chain.push(block);
    }

    public isValidChain(): boolean {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (currentBlock.previousBlockHash !== previousBlock.blockHash) {
                return false;
            }
        }
        return true;
    }
}

class POW {
    private difficulty: number;
    private block: Block;


    constructor(difficulty: number, block: Block) {
        this.difficulty = difficulty;
        this.block = block;
    }

    public async mine(block: Block, proposer: string): Promise<{ proposer: string, nonce: number, hash: string}>{
        let nonce = 0;
        let hash = '';

        while(true){
           // const dataToHash = this.createBlockHeader(block, nonce);
            //hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(dataToHash));
            hash = this.calculateHash(nonce);

            console.log(`Proposer: ${proposer}, Nonce: ${nonce}, Hash: ${hash}`);
            if(this.isValidHash(hash)){
                break;
            }

            nonce++;
            
        }

        return { proposer, nonce, hash };
    }



    private calculateHash(nonce: number): string {   
        const transactionsData = JSON.stringify(this.block.transactions.map(tx => ({
            from: tx.from,
            to: tx.to,
            amount: tx.amount.toString(),
            nonce: tx.nonce.toString(),
            v: tx.v,
            r: tx.r,
            s: tx.s
        })));

        const dataToHash = 
                this.block.timestamp.toString()+
                this.block.previousBlockHash+ 
                transactionsData +
                nonce.toString()+
                this.block.stateRoot+
                this.block.batchData
            
        const hash = sha256(toUtf8Bytes(dataToHash)).toString();
        return hash;
    }

    private isValidHash(hash: string): boolean {
        const prefix = '0'.repeat(this.difficulty);
        return hash.substring(2).startsWith(prefix);
    }
}



class OptimisticRollup {
    public pendingTransactions: SignedTransaction[] = [];
    private accounts: Map<string, { balance: bigint, nonce: bigint }> = new Map();
    public l1Contract: ethers.Contract;
    private blocks: Block[] = [];
    private currentBlockNumber: bigint = BigInt(0);
    private pow: POW;
    private chain: Blockchain;
   

    // 구현 할 것
    // tx with sig -> mempool(x) -> tx수집 및 verify -> L2 stateroot 변경 -> 블록 생성 -> L2에서는 상태 변화 끝
    //                                              -> Batch 생성(serialize) -> L1에 제출

    // 트랜잭션 관련 함수

    constructor(difficulty: number) {
        // const abi = [
        //     "function submitBatch(bytes32 _stateRoot, bytes _transactions) external",
        //     "event BatchSubmitted(uint256 indexed batchId, bytes32 stateRoot)"
        // ];
        // this.l1Contract = new ethers.Contract(l1ContractAddress, abi, provider);

        this.l1Contract = contract;

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

        // POW 객체 초기화
        this.pow = new POW(difficulty, genesisBlock);
        this.chain = new Blockchain();
        this.chain.addBlock(genesisBlock);
        this.currentBlockNumber = BigInt(1);
        const previousBlockHash = genesisBlock.blockHash;
    }

    async addTransaction(tx: Transaction, signer: ethers.Signer): Promise<void> {
        const signedTx = await this.signTransaction(tx, signer);
        if (await this.verifyTransaction(signedTx.signedTx, signedTx.sig)) {
            this.pendingTransactions.push(signedTx.signedTx, signedTx.sig);
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
    
        return {
            signedTx: {
                ...tx,
                v: parsedTx.v!,
                r: parsedTx.r!,
                s: parsedTx.s!,
                hash: messageHash
            },
            sig: {
                v: parsedTx.v!,
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
        const recoveredAddress = ethers.utils.recoverAddress(messageHash, sig);

        // 메시지는 위조되지 않았나? 검증
        if(tx.hash == messageHash) {
            console.log("message is not forged");
        }
    
        console.log("Recovered address:", recoveredAddress); // 보낸 사람이 정말 서명한 사람인가? 검증
        console.log("Original from address:", tx.from);
    
        // 서명자 일치 확인 및 메시지 위조 여부 모두 담은 결과 반환해야함
        return recoveredAddress.toLowerCase() === tx.from.toLowerCase();
    }

   public async createHash(tx: Transaction, signer: ethers.Signer): Promise<{ signedTx: SignedTransaction; sig: any }> {
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

        tx.hash = messageHash;

        // 서명된 트랜잭션과 서명 반환
        const signedTx = await signer.signTransaction(txData);
        const signature = ethers.utils.splitSignature(signedTx);

        const result: SignedTransaction = {
            ...tx,
            v: signature.v,
            r: signature.r,
            s: signature.s,
            hash: messageHash,
        };

        return { signedTx: result, sig: signature };
        }

    // 배치 관련 함수

    async processBatch(proposers: string[]): Promise<void> {
        
        // 1. 트랜잭션 실행
        this.executePendingTransactions();
        console.log("execute transactions", this.pendingTransactions)

        // 2. 상태 루트 계산
        const stateRoot = this.computeStateRoot();
        console.log("stateRoot", stateRoot)

        // 3. 배치 생성
        const previousBlockHash = this.blocks.length > 0 ? this.blocks[this.blocks.length - 1].blockHash : ethers.constants.HashZero;
        console.log(ethers.constants.HashZero)
        console.log('previousBlockHash before creating new block:', previousBlockHash);
        const timestamp = Date.now();
        const calldata = this.encodeBatchData(this.pendingTransactions);

        // 새로운 블록 생성
        const blockData: BlockData = {
            transactions: this.pendingTransactions,
            stateRoot,
            blockNumber: this.currentBlockNumber,
            previousBlockHash,
            timestamp,
            blockHash: '',
            nonce: BigInt(0),
            batchData: calldata
        };

        const newBlock = new Block(blockData);

        // 가장 논스 값이 적게 든 사용자가 proposer가 됨
        const miningPromises = proposers.map(proposer => this.pow.mine(newBlock, proposer));
        const firstResult = await Promise.all(miningPromises);
        const bestResult = firstResult.reduce((prev, current) => prev.nonce < current.nonce ? prev : current);

        // 배치 데이터를 직렬화합니다.
        console.log("bestResult", bestResult)

        const batchData: Batch = { proposer: bestResult.proposer, timestamp, calldata };
        console.log("batchData", batchData)
        
        // 블록 해시 계산
        newBlock.blockHash = this.computeBlockHash(previousBlockHash, stateRoot, newBlock.blockNumber, newBlock.timestamp, newBlock.transactions,BigInt(bestResult.nonce));
        newBlock.nonce = BigInt(bestResult.nonce);

        this.blocks.push(newBlock);
        this.chain.addBlock(newBlock);
        this.currentBlockNumber = newBlock.blockNumber + BigInt(1);
       
        console.log("newBlock before submit", newBlock)
        // 배치를 L1에 제출합니다.
        await this.submitBatch(batchData);

        // 대기 중인 트랜잭션 초기화
        this.pendingTransactions = [];
    }
    
    
    private executePendingTransactions(): void {
        this.pendingTransactions.forEach(tx => {
            this.updateAccountState(tx);
        });
    }

    private encodeBatchData(batch: SignedTransaction[]): string {
        const encodedBatch = batch.map(tx => {
            if (tx.amount < 0 || tx.nonce < 0) {
                throw new Error(`Invalid transaction: amount or nonce is negative. Amount: ${tx.amount}, Nonce: ${tx.nonce}`);
            }
            return [tx.from, tx.to, tx.amount, tx.nonce, tx.v, tx.r, tx.s];
        });
    
        console.log("Encoded batch data:", encodedBatch);

        try {
            return ethers.utils.defaultAbiCoder.encode(
                ['tuple(address from, address to, uint256 amount, uint256 nonce, uint8 v, bytes32 r, bytes32 s)[]'],
                [encodedBatch]
            );
        } catch (error) {
            console.error('Error encoding batch:', error);
            console.error('Problematic batch:', JSON.stringify(batch, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));
            throw error;
        }
    }
    
    private async submitBatch(batch: Batch): Promise<void> {
        try {
            const signer = this.l1Contract.signer;
        if (!signer) {
            throw new Error("L1 Contract requires a signer");
        }

        const calldataBytes = ethers.utils.arrayify(batch.calldata);
        const calldataArray = [];
        for (let i = 0; i < calldataBytes.length; i += 32) {
            const chunk = calldataBytes.slice(i, i + 32);
            calldataArray.push(ethers.utils.hexZeroPad(ethers.utils.hexlify(chunk), 32));
        }

       
        const tx = await this.l1Contract.submitBatch(calldataArray, batch.proposer);
       // const tx = await this.l1Contract.submitBatch(batch.calldata /*, ethers.utils.hexlify(batch.timestamp)*/);
        await tx.wait();
        console.log(`Batch submitted with state root: ${batch.calldata}`);

        } catch (error) {
            console.error('Error submitting batch:', error);
            // 재시도 로직 추가 가능
        }
    }

    private updateAccountState(tx: SignedTransaction & { nonce: bigint }): void {
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
    }

    private computeStateRoot(): string { // 제대로 알아보기, rlp encoding사용하기
        const leaves = Array.from(this.accounts.entries()).map(([address, account]) =>
            ethers.utils.keccak256(
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'uint256', 'uint256'],
                    [address, account.balance, account.nonce]
                )
            )
        );

        const merkleTree = this.buildMerkleTree(leaves);
        console.log("merkleTree", merkleTree)
        return merkleTree[merkleTree.length - 1][0];
    }

    private computeTransactionRoot(transactions: SignedTransaction[]): string { // transactionRoot 수정 후 블록에 추가 할 것
        const leaves = transactions.map(tx => ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                ['address', 'address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
                [tx.from, tx.to, tx.amount, tx.nonce, tx.v, tx.r, tx.s]
            )
        ));

        const merkleTree = this.buildMerkleTree(leaves);
        return merkleTree[merkleTree.length - 1][0];
    }

    private buildMerkleTree(leaves: string[]): string[][] { // MPT 써보기
        if (leaves.length === 0) return [['']];
        
        let tree = [leaves];
        
        while (tree[tree.length - 1].length > 1) {
            const currentLevel = tree[tree.length - 1];
            const nextLevel: string[] = [];

            for (let i = 0; i < currentLevel.length; i += 2) {
                if (i + 1 < currentLevel.length) {
                    nextLevel.push(
                        ethers.utils.keccak256(
                            ethers.utils.solidityPack(
                                ['bytes32', 'bytes32'],
                                [currentLevel[i], currentLevel[i + 1]]
                            )
                        )
                    );
                } else {
                    nextLevel.push(currentLevel[i]);
                }
            }
            tree.push(nextLevel);
        }
        return tree;
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

        console.log('transactionsData:', transactionsData);
        const blockData = ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'bytes32', 'uint256', 'uint256', 'bytes', 'uint256'],
            [previousBlockHash, stateRoot, blockNumber, timestamp, transactionsData, nonce]
        );
        console.log('blockData:', blockData); 

        const blockHash = ethers.utils.keccak256(blockData);
        console.log('Computed block hash:', blockHash);
        return blockHash;
    }
    

    // Method to get account balance
    getBalance(address: string): bigint {
        return this.accounts.get(address)?.balance || BigInt(0);
    }

    // Method to deposit funds (simplified)
    deposit(address: string, amount: bigint): void {
        const account = this.accounts.get(address) || { balance: BigInt(0), nonce: BigInt(0) };
        account.balance += amount;
        this.accounts.set(address, account);
    }
}

export { OptimisticRollup, Transaction, SignedTransaction, POW };


