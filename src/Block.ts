export interface BlockData {
    index: number;
    timestamp: string;
    data: any;
    prevHash: string;
    hash: string;
    nonce: number;
}

export class Block {
    public index: number;
    public timestamp: string;
    public data: any;
    public prevHash: string;
    public hash: string;
    public nonce: number;

    constructor(blockData: BlockData) {
        this.index = blockData.index;
        this.timestamp = blockData.timestamp;
        this.data = blockData.data;
        this.prevHash = blockData.prevHash;
        this.hash = blockData.hash;
        this.nonce = blockData.nonce;
    }

    public get blockHash(): string {
        return this.hash;
    }

    public set blockHash(hash: string) {
        this.hash = hash;
    }
}
