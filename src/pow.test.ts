import { Block, Blockchain } from './class';
import { Block as BlockType } from './class';
import { POW } from './pow';
import { sha256, toUtf8Bytes } from 'ethers/lib/utils';

interface BlockData {
    index: number;
    timestamp: string;
    data: any;
    prevHash: string;
    hash: string;
    nonce: number;
}

// Genesis 블록 생성
const genesisBlockData: BlockData = {
    index: 0,
    timestamp: new Date().toString(),
    data: "Genesis Block",
    prevHash: "0",
    hash: "0",
    nonce: 0,
};

const genesisBlock = new Block(genesisBlockData);

// 새로운 블록 데이터 생성
const newBlockData: BlockData = {
    index: 1,
    timestamp: new Date().toString(),
    data: "New Block Data",
    prevHash: genesisBlock.blockHash,
    hash: "",
    nonce: 0,
};

const newBlock = new Block(newBlockData);

// 난이도 설정
const difficulty = 1; // 예시 난이도

// POW 클래스 인스턴스 생성
const pow = new POW(difficulty, newBlock);

async function testPOW() {
    try {
        // 채굴 시작
        const result = await pow.mine("Proposer1");
        console.log(`Block mined by ${result.proposer}`);
        console.log(`Nonce: ${result.nonce}`);
        console.log(`Hash: ${result.hash}`);

        // 새로운 블록 정보 업데이트
        newBlock.nonce = BigInt(result.nonce);
        newBlock.blockHash = result.hash;

        // 블록체인 인스턴스 생성
        const blockchain = new Blockchain();

        // 블록체인에 새 블록 추가
        blockchain.addBlock(newBlock);

        // 블록체인 유효성 검사
        const isValid = blockchain.isValidChain();
        console.log(`Blockchain valid: ${isValid}`);
    } catch (error) {
        console.error("Error mining block:", error);
    }
}

// 테스트 실행
testPOW();
