import { ethers } from 'ethers';

class MerkleTree {
    static buildMerkleTree(leaves: string[]): string[][] {
        if (leaves.length === 0) return [['']];

        let tree = [leaves];

        while (tree[tree.length - 1].length > 1) {
            const currentLevel = tree[tree.length - 1];
            const nextLevel: string[] = [];

            for (let i = 0; i < currentLevel.length; i += 2) {
                if (i + 1 < currentLevel.length) {
                  nextLevel.push(
                    ethers.utils.keccak256(
                      ethers.utils.solidityPack(
                        ["bytes32", "bytes32"],
                        [currentLevel[i], currentLevel[i + 1]]
                      )
                    )
                  );
                } else {
                  nextLevel.push(currentLevel[i]);
                }
            }
            tree.push(nextLevel);
        }
        return tree;
    }

    static generateMerkleProof(tree: string[][], index: number): string[] {
        const proof: string[] = [];
        let currentIndex = index;

        for (let i = 0; i < tree.length - 1; i++) {
            const levelLength = tree[i].length;
            const pairIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

            if (pairIndex < levelLength) {
                proof.push(tree[i][pairIndex]);
            }

            currentIndex = Math.floor(currentIndex / 2);
        }

        return proof;
    }
}

export default MerkleTree;
