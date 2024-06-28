import { ethers } from 'ethers';
import { sha256 } from 'ethers/lib/utils';

interface SignedTransaction {
    from: string;
    to: string;
    amount: bigint;
    nonce: bigint;
    v: number;
    r: string;
    s: string;
}

interface Batch {
    proposer: string;
    timestamp: number;
    calldata: string;
}

interface BlockData {
    index: number;
    timestamp: string;
    data: any;
    prevHash: string;
    hash: string;
    nonce: number;
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

    constructor(data: BlockData) {
        this.transactions = [];
        this.stateRoot = '';
        this.blockNumber = BigInt(0);
        this.previousBlockHash = data.prevHash;
        this.timestamp = new Date(data.timestamp).getTime();
        this.blockHash = data.hash;
        this.nonce = BigInt(data.nonce);//초기화 부분 제대로 보기
        this.batchData = '';
    }

    public calculateHash(): string {
        return sha256(this.transactions + this.stateRoot + this.timestamp + this.blockNumber + this.blockHash + this.nonce).toString();
    }

    public mineBlock(difficulty: number): void {
        while (this.blockHash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
            this.nonce++;
            this.blockHash = this.calculateHash();
        }
        console.log("Block mined: " + this.blockHash);

    }
}

export class Blockchain {
    public chain: Block[];
    public difficulty: number;

    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 2; // Example difficulty
    }

    private createGenesisBlock(): Block {
        return new Block({ index: 0, timestamp: new Date().toString(), data: "Genesis Block", prevHash: "0", hash: "0", nonce: 0 });
    }

    public getLatestBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    public addBlock(newBlock: Block): void {
        newBlock.previousBlockHash = this.getLatestBlock().blockHash;
        newBlock.mineBlock(this.difficulty);
        this.chain.push(newBlock);
    }

    public isValidChain(): boolean {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const prevBlock = this.chain[i - 1];

            if (currentBlock.blockHash !== currentBlock.calculateHash()) {
                return false;
            }

            if (currentBlock.previousBlockHash !== prevBlock.blockHash) {
                return false;
            }
        }
        return true;
    }
}
