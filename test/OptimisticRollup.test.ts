import { ethers } from 'hardhat';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import OptimisticRollup from '../src/OptimisticRollup';
import { Transaction, SignedTransaction } from '../src/interfaces/Transaction';
import TransactionService from '../src/services/TransactionService';

const chai = require('chai');
const { expect } = chai;

describe('Optimistic Rollup Tests', function () {
  let accounts: SignerWithAddress[];
  let rollup: OptimisticRollup;

  // 테스트 실행 전 초기화 단계
  before(async function () {
    accounts = await ethers.getSigners();
    rollup = new OptimisticRollup(1);

    console.log('Using Hardhat accounts...');
    for (const account of accounts) {
      const balance = await account.getBalance();
      rollup.deposit(account.address, BigInt(balance.toString()));
    }
  });

  // 서명된 트랜잭션을 생성하는 함수
  async function createSignedTransaction(
    tx: Transaction,
    signer: SignerWithAddress,
  ): Promise<{ signedTx: SignedTransaction; sig: any }> {
    const transactionService = new TransactionService();
    return await transactionService.signTransaction(tx, signer);
  }

  // 트랜잭션을 검증하는 함수
  async function verifyTransaction(
    signedTx: SignedTransaction,
    sig: any,
    rollup: OptimisticRollup,
  ): Promise<boolean> {
    const transactionService = new TransactionService();
    return await transactionService.verifyTransaction(signedTx, sig);
  }

  // 트랜잭션 서명 및 검증
  async function signAndVerify(
    tx: Transaction,
  ): Promise<SignedTransaction | null> {
    const account = accounts.find(
      (a) => a.address.toLowerCase() === tx.from.toLowerCase(),
    );

    if (!account) {
      console.error('해당 계정의 서명자가 존재하지 않습니다:', tx.from);
      return null;
    }

    console.log(`트랜잭션 서명 중... (from: ${tx.from})`);
    const { signedTx, sig } = await createSignedTransaction(tx, account);
    console.log('서명된 트랜잭션:', signedTx);

    console.log('트랜잭션 검증 중...');
    const isValid = await verifyTransaction(signedTx, sig, rollup);
    console.log('트랜잭션 검증 결과:', isValid ? '유효함' : '유효하지 않음');

    return isValid ? signedTx : null;
  }

  it('should sign and verify transactions', async function () {
    console.log('Testing transaction signing and verification...');

    const transactions1: Transaction[] = [
      {
        from: accounts[0].address,
        to: accounts[1].address,
        amount: BigInt(10),
        fee: BigInt(1),
        nonce: BigInt(0),
        data: '0x',
        gasPrice: BigInt(1),
        gasLimit: BigInt(21000),
        chainId: 1,
        hash: '',
      },
      {
        from: accounts[1].address,
        to: accounts[2].address,
        amount: BigInt(20),
        fee: BigInt(1),
        nonce: BigInt(1),
        data: '0x',
        gasPrice: BigInt(1),
        gasLimit: BigInt(21000),
        chainId: 1,
        hash: '',
      },
    ];

    const signedTransactions1: SignedTransaction[] = [];
    for (const tx of transactions1) {
      const signedTx = await signAndVerify(tx);
      if (signedTx !== null) {
        signedTransactions1.push(signedTx);
      }
    }

    expect(signedTransactions1.length).to.be.greaterThan(
      0,
      'No transactions were signed.',
    );
  });

  it('should process transaction batch and verify batch', async function () {
    console.log('Processing and verifying batch...');

    const proposers = accounts.slice(0, 3).map((a) => a.address);

    const signedTx = await signAndVerify({
      from: accounts[0].address,
      to: accounts[1].address,
      amount: BigInt(10),
      fee: BigInt(1),
      nonce: BigInt(0),
      data: '0x',
      gasPrice: BigInt(1),
      gasLimit: BigInt(21000),
      chainId: 1,
      hash: '',
    });

    if (signedTx !== null) {
      rollup.pendingTransactions.push(signedTx);
    }

    const batchId = await rollup.processBatch(proposers);
    expect(batchId).to.be.a('string', 'Batch processing failed');

    await new Promise((resolve) => setTimeout(resolve, 20000)); // wait
    const isBatchValid = await rollup.verifyBatch(batchId);
    expect(isBatchValid).to.be.true;
  });
});
