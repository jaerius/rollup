
// //import { Block } from './class';
// import { sha256, toUtf8Bytes } from 'ethers/lib/utils';

// export class POW {
//     private difficulty: number;
//    // private block: Block;
    

//     constructor(difficulty: number, /*block: Block*/) {
//         this.difficulty = difficulty;
//         //this.block = block;
//     }

//     public async mine(proposer: string): Promise<{ proposer: string, nonce: bigint, hash: string }> {
//         let nonce = BigInt(0);
//         let hash = '';

//         while (true) {
//             hash = this.calculateHash(nonce);

//             console.log(`Proposer: ${proposer}, Nonce: ${nonce}, Hash: ${hash}`);
//             if (this.isValidHash(hash)) {
//                 break;
//             }

//             nonce++;
//             console.log(`Proposer: ${proposer}, Current Nonce: ${nonce}`);
//         }

//         return { proposer, nonce, hash };
//     }

//     private calculateHash(nonce: bigint): string {
//        // const dataToHash = this.block.previousBlockHash + this.block.stateRoot + this.block.blockNumber + JSON.stringify(this.block.transactions) + this.block.timestamp + nonce + this.block.batchData;
//         const hash = sha256(toUtf8Bytes(dataToHash)).toString();
//         return hash;
//     }

//     private isValidHash(hash: string): boolean {
//         const prefix = '0'.repeat(this.difficulty);
//         return hash.startsWith(prefix);
//     }
// }
import { sha256, toUtf8Bytes } from 'ethers/lib/utils';

interface Block {
    index: number;
    timestamp: string;
    data: any;
    prevHash: string;
    hash: string;
    nonce: number;
}

export class POW {
    private difficulty: number;
    private blockData: Block;

    constructor(difficulty: number, blockData: Block) {
        this.difficulty = difficulty;
        this.blockData = blockData;
    }

    public async mine(proposer: string): Promise<{ proposer: string, nonce: bigint, hash: string }> {
        let nonce = BigInt(0);
        let hash = '';

        while (true) {
            hash = this.calculateHash(nonce);

            console.log(`Proposer: ${proposer}, Nonce: ${nonce}, Hash: ${hash}`);
            if (this.isValidHash(hash)) {
                break;
            }

            nonce++;
            console.log(`Proposer: ${proposer}, Current Nonce: ${nonce}`);
        }

        return { proposer, nonce, hash };
    }

    private calculateHash(nonce: bigint): string {
        const dataToHash = this.blockData.index +
            this.blockData.prevHash +
            this.blockData.timestamp +
            JSON.stringify(this.blockData.data) +
            nonce;
            
        const hash = sha256(toUtf8Bytes(dataToHash)).toString();
        return hash;
    }

    private isValidHash(hash: string): boolean {
        const prefix = '0'.repeat(this.difficulty);
        return hash.substring(2).startsWith(prefix);
    }
}

async function main() {
    const blockData = {
        index: 1,
        timestamp: new Date().toISOString(),
        data: { amount: 100 },
        prevHash: '0'.repeat(64),
        hash: '',
        nonce: 0,
    };

    const difficulty = 3; // 테스트를 위해 난이도를 낮게 설정
    const pow = new POW(difficulty, blockData);

    const result = await pow.mine('proposer1');

    console.log('Mining Result:', result);
    console.log('Proposer:', result.proposer);
    console.log('Nonce:', result.nonce);
    console.log('Hash:', result.hash);
}

main().catch(console.error);