import { SignedTransaction } from '../interfaces/Transaction';

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
    }
}
