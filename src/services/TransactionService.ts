import { SignedTransaction, Transaction } from '../interfaces/Transaction';
import { ethers } from 'ethers';
import { RLP, keccak256 } from 'ethers/lib/utils';

class TransactionService {
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

        const signedTx = await signer.signTransaction(txData);
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
        const txData = {
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

        return recoveredAddress.toLowerCase() === tx.from.toLowerCase();
    }

    public encodeBatchData(batch: SignedTransaction[]): string {
        const encodedTx = batch.map(tx => {
            if (tx.amount < 0 || tx.nonce < 0) {
                throw new Error(`Invalid transaction: amount or nonce is negative. Amount: ${tx.amount}, Nonce: ${tx.nonce}`);
            }
            return RLP.encode([tx.from, tx.to, tx.amount, tx.nonce, tx.v, tx.r, tx.s]);
        });
        return RLP.encode(encodedTx);
    }

    public decodeBatchData(batchData: string): SignedTransaction[] {
        // Decode the batch data into SignedTransaction array
        return [];
    }
}

export default TransactionService;
