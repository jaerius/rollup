import { Block } from './Block';
// 미사용
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
