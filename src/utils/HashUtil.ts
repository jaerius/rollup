import { ethers } from 'ethers';

class HashUtil {
    public static computeBlockHash(
        previousBlockHash: string,
        stateRoot: string,
        blockNumber: bigint,
        timestamp: number,
        transactions: any[],
        nonce: bigint
    ): string {
        const transactionsData = ethers.utils.defaultAbiCoder.encode(
            ['tuple(address from, address to, uint256 amount, uint256 nonce, uint8 v, bytes32 r, bytes32 s)[]'],
            [transactions.map(tx => [tx.from, tx.to, tx.amount, tx.nonce, tx.v, tx.r, tx.s])]
        );

        const blockData = ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'bytes32', 'uint256', 'uint256', 'bytes', 'uint256'],
            [previousBlockHash, stateRoot, blockNumber, timestamp, transactionsData, nonce]
        );

        return ethers.utils.keccak256(blockData);
    }
}

export default HashUtil;
