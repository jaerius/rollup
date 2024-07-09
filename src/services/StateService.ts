import { Level } from 'level';
import { RLP, keccak256 } from 'ethers/lib/utils';
import { SignedTransaction } from '../interfaces/Transaction';
import MerkleTree from '../utils/MerkleTree';
import { ethers } from 'ethers';

class StateService {
    private accounts: Map<string, { balance: bigint, nonce: bigint }> = new Map();

    constructor(private db: Level) {}

    public async updateAccountState(tx: SignedTransaction & { nonce: bigint }): Promise<void> {
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
        const key = `stateRoot:${tx.hash}`;
        console.log("Saving stateRoot:", stateRoot, "with key:", key);
        
        try {
            await this.db.put(key, stateRoot);
            console.log("stateroot", stateRoot);

            // 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 500));

            const check = await this.db.get(key);
            console.log("new check", key, check);
        } catch (error) {
            console.error("Error storing or fetching state root:", error);
        }
        
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

        ///snap shot
        async saveSnapshot(transactionIndex: string, snapshot: any): Promise<void> {
            const key = `snapshot:${transactionIndex}`;
            await this.db.put(key, snapshot);
            console.log(`Saved snapshot at key: ${key}`);
        }

    public computeStateRoot(): string {
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

    public async revertToState(batchIndex: number): Promise<void> {
        const snapshot = await this.getSnapshotAtBatch(batchIndex);
        this.accounts = snapshot.accounts;
    }

    public async getSnapshotAtBatch(batchIndex: number): Promise<any> {
        const state = await this.db.get(`snapshot:${batchIndex}`);
        return {
            accounts: new Map(JSON.parse(state).accounts),
            stateRoot: JSON.parse(state).stateRoot
        };
    }

    public deposit(address: string, amount: bigint): void {
        const account = this.accounts.get(address) || { balance: BigInt(0), nonce: BigInt(0) };
        account.balance += amount;
        this.accounts.set(address, account);
      }
    
}

export default StateService;
