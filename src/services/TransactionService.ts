import { SignedTransaction, Transaction } from '../interfaces/Transaction';
import { ethers } from 'ethers';
import { RLP, keccak256 } from 'ethers/lib/utils';
import zlib from 'zlib';

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
    
        const signedTx = await signer.signTransaction(txData); //sign message말고, transactino으로 했더니 됨
        const parsedTx = ethers.utils.parseTransaction(signedTx);

        const messageHash = ethers.utils.keccak256(ethers.utils.serializeTransaction(txData));
    
        let v = parsedTx.v!;
        if (v >= 37) {
            v = v - (2 * txData.chainId + 8);  // Adjust v value for EIP-155
        }

        console.log('서명된 트랜잭션 데이터:', txData);

        return {
            signedTx: {
                ...tx,
                v: v,
                r: parsedTx.r!,
                s: parsedTx.s!,
                hash: messageHash
            },
            sig: {
                v: v,
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

        let v = sig.v;
        if (v >= 37) {
            v = v - (2 * txData.chainId + 8);  // Adjust v value for EIP-155
        }

        console.log("검증된 트랜잭션 데이터:", txData);

        const recoveredAddress = ethers.utils.recoverAddress(messageHash, { v, r: sig.r, s: sig.s });

        // 메시지는 위조되지 않았나? 검증
        if(tx.hash == messageHash) {
            console.log("message is not forged");
        }
    
        console.log("Recovered address:", recoveredAddress); // 보낸 사람이 정말 서명한 사람인가? 검증
        console.log("Original from address:", tx.from);
    
        // 서명자 일치 확인 및 메시지 위조 여부 모두 담은 결과 반환해야함
        return recoveredAddress.toLowerCase() === tx.from.toLowerCase();
    }

    public encodeBatchData(batch: SignedTransaction[]): string {
        const encodedTx = batch.map(tx => {
            if (tx.amount < 0 || tx.nonce < 0) {
                throw new Error(`Invalid transaction: amount or nonce is negative. Amount: ${tx.amount}, Nonce: ${tx.nonce}`);
            }
    
            // BigInt 값을 바이트 배열로 변환
            const amountBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.amount.toString()));
            const nonceBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.nonce.toString()));
            const feeBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.fee.toString()));
            const gasPriceBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.gasPrice.toString()));
            const gasLimitBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.gasLimit.toString()));
            const chainIdBytes = ethers.utils.arrayify(ethers.BigNumber.from(tx.chainId));
            const v = ethers.utils.arrayify(ethers.BigNumber.from(tx.v));

            const rlpEncoded = ethers.utils.RLP.encode([
                tx.from,
                tx.to,
                amountBytes,
                nonceBytes,
                feeBytes,
                gasPriceBytes,
                gasLimitBytes,
                chainIdBytes,
                v,
                tx.r,
                tx.s,
                tx.data
            ]);
            return rlpEncoded;
            });
    
        const encodedBatch = ethers.utils.RLP.encode(encodedTx);
        return encodedBatch;
    }

    public async decodeBatchData(compressedData: string): Promise<SignedTransaction[]> {
        // Hex 디코딩
        const hexDecodedData = ethers.utils.arrayify(compressedData);
        console.log("Hex decoded data:", hexDecodedData);
 
        // UTF-8 바이트 배열로 변환
        const utf8Data = ethers.utils.toUtf8String(hexDecodedData);
        console.log("UTF-8 data:", utf8Data);
 
        // Base64 디코딩
        const base64DecodedData = Buffer.from(utf8Data, 'base64');
        console.log("Base64 decoded data:", base64DecodedData);
 
         try {
             const decompressedData = await new Promise<Buffer>((resolve, reject) => {
                 zlib.gunzip(base64DecodedData, (error, result) => {
                     if (error) {
                         console.error("Gunzip error:", error);
                         reject(error);
                     } else {
                         console.log("gunzip result (Buffer):", result);
                         resolve(result);
                     }
                 });
             });
     
             const rlpEncodedBatch = decompressedData.toString('utf-8');
             console.log("RLP encoded batch:", rlpEncodedBatch);
     
             // 첫 번째 RLP 디코딩: 트랜잭션 목록 추출
             const decodedBatch = ethers.utils.RLP.decode(rlpEncodedBatch);
     
             // 트랜잭션 목록에서 각각의 트랜잭션을 다시 디코딩
             const transactions: SignedTransaction[] = (decodedBatch as string[]).map(this.decodeTransaction);
     
             return transactions;

            } catch (err) {
                 console.error("Decompression error:", err);
                 throw err;
            }
    
    
        }

        decodeTransaction(rlpEncodedTx: string): SignedTransaction {
            const decoded = ethers.utils.RLP.decode(rlpEncodedTx);
        
            // 트랜잭션 객체 생성
            const tx: SignedTransaction = {
            from: decoded[0],
            to: decoded[1],
            amount: BigInt(ethers.BigNumber.from(decoded[2]).toString()),
            nonce: BigInt(ethers.BigNumber.from(decoded[3]).toString()),
            fee: BigInt(ethers.BigNumber.from(decoded[4]).toString()),
            gasPrice: BigInt(ethers.BigNumber.from(decoded[5]).toString()),
            gasLimit: BigInt(ethers.BigNumber.from(decoded[6]).toString()),
            chainId: Number(ethers.BigNumber.from(decoded[7])),
            v: Number(ethers.BigNumber.from(decoded[8])),
            r: decoded[9],
            s: decoded[10],
            data: decoded[11],
            hash: ''
        };
    
        // 서명 전 필드만 포함한 트랜잭션 데이터 객체
        const txData = {
            nonce: Number(tx.nonce),
            gasPrice: ethers.utils.hexlify(tx.gasPrice),
            gasLimit: ethers.utils.hexlify(tx.gasLimit),
            to: tx.to,
            value: ethers.utils.hexlify(tx.amount),
            data: tx.data,
            chainId: tx.chainId
        };
    
        // 트랜잭션 직렬화
        const serializedTx = ethers.utils.serializeTransaction(txData);
        console.log("Serialized transaction:", serializedTx);
    
        // 트랜잭션 해시 계산
        tx.hash = ethers.utils.keccak256(serializedTx);
        console.log("Transaction hash:", tx.hash);
    
        return tx;
        }  
        
}

export default TransactionService;
