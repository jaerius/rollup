import { Level } from 'level';
import { RLP, keccak256 } from 'ethers/lib/utils';
import { SignedTransaction } from '../interfaces/Transaction';
import MerkleTree from '../utils/MerkleTree';

class StateService {
    private accounts: Map<string, { balance: bigint, nonce: bigint }> = new Map();

    constructor(private db: Level) {}

    public async updateAccountState(tx: SignedTransaction & { nonce: bigint }): Promise<void> {
        const fromAccount = this.accounts.get(tx.from) || { balance: BigInt(0), nonce: BigInt(0) };
        if (fromAccount.balance < tx.amount) {
            throw new Error(`Insufficient balance. Account: ${tx.from}, Balance: ${fromAccount.balance}, Amount: ${tx.amount}`);
        }

        fromAccount.balance -= tx.amount;
        fromAccount.nonce += BigInt(1);
        this.accounts.set(tx.from, fromAccount);

        const toAccount = this.accounts.get(tx.to) || { balance: BigInt(0), nonce: BigInt(0) };
        toAccount.balance += tx.amount;
        this.accounts.set(tx.to, toAccount);

        const stateRoot = this.computeStateRoot();
        await this.db.put(`stateRoot:${tx.hash}`, stateRoot);
        await this.db.put(`txLog:${tx.hash}`, JSON.stringify(tx));
    }

    private computeStateRoot(): string {
        const leaves = Array.from(this.accounts.entries()).map(([address, account]) => {
            const encodedAccount = RLP.encode([BigInt(address), account.balance, account.nonce]);
            return keccak256(encodedAccount);
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
}

export default StateService;
