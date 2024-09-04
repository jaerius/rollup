import { Block } from "./Block";
import { sha256, toUtf8Bytes } from "ethers/lib/utils";

class POW {
  private difficulty: number;
  private block: Block;

  constructor(difficulty: number, block: Block) {
    this.difficulty = difficulty;
    this.block = block;
  }

  public async mine(
    block: Block,
    proposer: string
  ): Promise<{ proposer: string; nonce: number; hash: string }> {
    let nonce = 0;
    let hash = "";

    while (true) {
      hash = this.calculateHash(nonce, proposer);
      console.log(`Proposer: ${proposer}, Nonce: ${nonce}, Hash: ${hash}`);
      if (this.isValidHash(hash)) {
        break;
      }
      nonce++;
    }

    return { proposer, nonce, hash };
  }

  private calculateHash(nonce: number, proposer: string): string {
    const transactionsData = JSON.stringify(
      this.block.transactions.map((tx) => ({
        from: tx.from,
        to: tx.to,
        amount: tx.amount.toString(),
        nonce: tx.nonce.toString(),
        v: tx.v,
        r: tx.r,
        s: tx.s,
      }))
    );

    const dataToHash =
      this.block.timestamp.toString() +
      this.block.previousBlockHash +
      transactionsData +
      nonce.toString() +
      proposer +
      this.block.stateRoot +
      this.block.batchData;

    const hash = sha256(toUtf8Bytes(dataToHash)).toString();
    return hash;
  }

  private isValidHash(hash: string): boolean {
    const prefix = "0".repeat(this.difficulty);
    return hash.substring(2).startsWith(prefix);
  }
}

export default POW;
