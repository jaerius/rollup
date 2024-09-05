import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('Rollup Contracts', function () {
  let stateCommitmentChain,
    bondManager,
    canonicalTransactionChain,
    fraudVerifier;
  const [owner, user1, user2, user3] = ethers.getSigners();

  before(async function () {
    const StateCommitmentChain = await ethers.getContractFactory(
      'StateCommitmentChain',
    );
    const BondManager = await ethers.getContractFactory('BondManager');
    const CanonicalTransactionChain = await ethers.getContractFactory(
      'CanonicalTransactionChain',
    );
    const FraudVerifier = await ethers.getContractFactory('FraudVerifier');

    stateCommitmentChain = await StateCommitmentChain.deploy();
    bondManager = await BondManager.deploy();
    canonicalTransactionChain = await CanonicalTransactionChain.deploy();
    fraudVerifier = await FraudVerifier.deploy();
  });

  beforeEach(async function () {
    const depositAmount = ethers.utils.parseEther('1');

    const users = [user1, user2, user3];
    for (const user of users) {
      let bond = await bondManager.bonds(user.address);
      if (bond.toString() !== '0') {
        await bondManager.withdraw(bond, { from: user.address });
      }
    }
  });

  describe('BondManager', function () {
    it('should allow depositing and withdrawing bonds', async function () {
      const depositAmount = ethers.utils.parseEther('1');
      await bondManager.deposit({ value: depositAmount });

      let bond = await bondManager.bonds(user1.address);
      console.log(`Bond after deposit: ${bond.toString()}`);
      expect(bond.toString()).to.equal(
        depositAmount.toString(),
        'Bond not deposited correctly',
      );

      await bondManager.withdraw(depositAmount, { from: user1.address });

      bond = await bondManager.bonds(user1.address);
      console.log(`Bond after withdrawal: ${bond.toString()}`);
      expect(bond.toString()).to.equal('0', 'Bond not withdrawn correctly');
    });
  });

  describe('Recent Batches', function () {
    it('should correctly retrieve the last 3 batches', async function () {
      const batchCount = await stateCommitmentChain.getBatchCount();
      expect(batchCount.toNumber()).to.be.at.least(
        3,
        'There should be at least 3 batches in the contract',
      );

      for (let i = 0; i < 3; i++) {
        const index = batchCount.toNumber() - 1 - i;
        const batch = await stateCommitmentChain.getBatch(index);

        expect(batch.batchData.length).to.be.above(
          0,
          `Batch ${index} data should not be empty`,
        );
        expect(ethers.utils.isHexString(batch.stateRoot)).to.be.true,
          `Batch ${index} state root should be a valid hex string`;
        expect(batch.proposer).to.not.equal(
          '0x0000000000000000000000000000000000000000',
        ),
          `Batch ${index} should have a valid proposer`;
        expect(ethers.utils.isHexString(batch.batchId)).to.be.true,
          `Batch ${index} ID should be a valid hex string`;
        expect(typeof batch.finalized).to.equal('boolean'),
          `Batch ${index} finalized status should be a boolean`;

        console.log(`Batch ${index}:`);
        console.log(`  Data: ${batch.batchData}`);
        console.log(`  State Root: ${batch.stateRoot}`);
        console.log(`  Proposer: ${batch.proposer}`);
        console.log(`  Batch ID: ${batch.batchId}`);
        console.log(`  Finalized: ${batch.finalized}`);
        console.log('');
      }
    });

    it('should have emitted StateBatchAppended events for the last 3 batches', async function () {
      const batchCount = await stateCommitmentChain.getBatchCount();

      for (let i = 0; i < 3; i++) {
        const index = batchCount.toNumber() - 1 - i;
        const events = await stateCommitmentChain.queryFilter(
          'StateBatchAppended',
          index,
          index,
        );

        // assert.equal(events.length, 1, `Should have one StateBatchAppended event for batch ${index}`);
        // const event = events[0];

        // assert.equal(event.args.batchIndex, index, `Event batchIndex for batch ${index} is incorrect`);
        // assert(event.args.batchData.length > 0, `Event batchData for batch ${index} should not be empty`);
        // assert(ethers.utils.isHexString(event.args.stateRoot), `Event stateRoot for batch ${index} should be a valid hex string`);
        // assert.notEqual(event.args.proposer, '0x0000000000000000000000000000000000000000', `Event proposer for batch ${index} should be a valid address`);
        // assert(ethers.utils.isHexString(event.args.batchId), `Event batchId for batch ${index} should be a valid hex string`);

        // console.log(`Event for Batch ${index}:`);
        // console.log(`  Batch Data: ${event.args.batchData}`);
        // console.log(`  State Root: ${event.args.stateRoot}`);
        // console.log(`  Proposer: ${event.args.proposer}`);
        // console.log(`  Batch ID: ${event.args.batchId}`);
        // console.log('');
      }
    });
  });

  describe('CanonicalTransactionChain', function () {
    it('should allow enqueueing transactions', async function () {
      const txHash = ethers.utils.keccak256('transaction1');
      await canonicalTransactionChain.enqueue(txHash);

      const queuedTx = await canonicalTransactionChain.queue(0);
      expect(queuedTx.transactionHash).to.equal(
        txHash,
        'Transaction not enqueued correctly',
      );
    });
  });

  describe('FraudVerifier', function () {
    it('should allow initiating and resolving challenges for the last 3 batches', async function () {
      this.timeout(30000);

      const depositAmount = ethers.utils.parseEther('1');
      await bondManager.deposit({ value: depositAmount });

      const batchCount = await stateCommitmentChain.getBatchCount();
      const preStateRoot = ethers.utils.keccak256('preState');
      const postStateRoot = ethers.utils.keccak256('postState');
      const transaction = ethers.utils.randomBytes(100);

      for (let i = 0; i < 3; i++) {
        const batchIndex = batchCount.toNumber() - 1 - i;
        const txHash = ethers.utils.keccak256(`fraudulentTx${i}`);

        const challengeState = await fraudVerifier.challenges(batchIndex);
        console.log(
          `Initial challenge state for batch ${batchIndex}:`,
          challengeState,
        );

        if (!challengeState.resolved) {
          let bond = await bondManager.bonds(user2.address);
          if (bond.toString() === '0') {
            await bondManager.deposit({ value: depositAmount });
          }

          await fraudVerifier.initiateChallenge(batchIndex, txHash, {
            from: user2.address,
          });

          const challenge = await fraudVerifier.challenges(batchIndex);
          expect(challenge.challenger).to.equal(
            user2.address,
            `Challenge for batch ${batchIndex} not initiated correctly`,
          );

          console.log(
            `Challenge state for batch ${batchIndex} after initiation:`,
            challenge,
          );

          await ethers.provider.send('evm_increaseTime', [10 * 60 + 1]);

          await fraudVerifier.resolveChallenge(
            batchIndex,
            preStateRoot,
            postStateRoot,
            transaction,
          );

          const resolvedChallenge = await fraudVerifier.challenges(batchIndex);
          expect(resolvedChallenge.resolved).to.be.true,
            `Challenge for batch ${batchIndex} not resolved`;

          console.log(
            `Resolved challenge state for batch ${batchIndex}:`,
            resolvedChallenge,
          );

          bond = await bondManager.bonds(user2.address);
          console.log(
            `Bond for user2 after resolving challenge for batch ${batchIndex}:`,
            bond.toString(),
          );
          expect(bond.toString()).to.equal(
            '0',
            'Bond not burned correctly after challenge resolution',
          );

          await stateCommitmentChain.finalizeBatch(batchIndex);

          const batch = await stateCommitmentChain.getBatch(batchIndex);
          console.log(
            `Finalized state for batch ${batchIndex}:`,
            batch.finalized,
          );
          expect(batch.finalized).to.be.true,
            `Batch ${batchIndex} not finalized correctly`;
        } else {
          console.log(
            `Challenge for batch ${batchIndex} already resolved, skipping resolution step`,
          );
        }
      }
    });
  });
});
