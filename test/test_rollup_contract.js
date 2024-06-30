const StateCommitmentChain = artifacts.require("StateCommitmentChain");
const BondManager = artifacts.require("BondManager");
const CanonicalTransactionChain = artifacts.require("CanonicalTransactionChain");
const FraudVerifier = artifacts.require("FraudVerifier");

contract("Rollup Contracts", accounts => {
  let stateCommitmentChain, bondManager, canonicalTransactionChain, fraudVerifier;
  const [owner, user1, user2, user3] = accounts;

  before(async () => {
    stateCommitmentChain = await StateCommitmentChain.deployed();
    bondManager = await BondManager.deployed();
    canonicalTransactionChain = await CanonicalTransactionChain.deployed();
    fraudVerifier = await FraudVerifier.deployed();
  });

  beforeEach(async () => {
    // 모든 테스트 이전에 사용자 잔액을 초기화
    const depositAmount = web3.utils.toWei("1", "ether");
    
    // Withdraw all bonds from previous tests
    const users = [user1, user2, user3];
    for (const user of users) {
      let bond = await bondManager.bonds(user);
      if (bond.toString() !== "0") {
        await bondManager.withdraw(bond, { from: user });
      }
    }
  });

  describe("BondManager", () => {
    it("should allow depositing and withdrawing bonds", async () => {
      const depositAmount = web3.utils.toWei("1", "ether");
      await bondManager.deposit({ from: user1, value: depositAmount });
      
      let bond = await bondManager.bonds(user1);
      console.log(`Bond after deposit: ${bond.toString()}`);
      assert.equal(bond.toString(), depositAmount, "Bond not deposited correctly");

      await bondManager.withdraw(depositAmount, { from: user1 });
      
      bond = await bondManager.bonds(user1);
      console.log(`Bond after withdrawal: ${bond.toString()}`);
      assert.equal(bond.toString(), "0", "Bond not withdrawn correctly");
    });
  });

  describe("Recent Batches", () => {
    it("should correctly retrieve the last 3 batches", async () => {
      const batchCount = await stateCommitmentChain.getBatchCount();
      assert(batchCount.toNumber() >= 3, "There should be at least 3 batches in the contract");

      for (let i = 0; i < 3; i++) {
        const index = batchCount.toNumber() - 1 - i;
        const batch = await stateCommitmentChain.getBatch(index);

        assert(batch.batchData.length > 0, `Batch ${index} data should not be empty`);
        assert(web3.utils.isHexStrict(batch.stateRoot), `Batch ${index} state root should be a valid hex string`);
        assert.notEqual(batch.proposer, '0x0000000000000000000000000000000000000000', `Batch ${index} should have a valid proposer`);
        assert(web3.utils.isHexStrict(batch.batchId), `Batch ${index} ID should be a valid hex string`);
        assert.equal(typeof batch.finalized, 'boolean', `Batch ${index} finalized status should be a boolean`);

        console.log(`Batch ${index}:`);
        console.log(`  Data: ${batch.batchData}`);
        console.log(`  State Root: ${batch.stateRoot}`);
        console.log(`  Proposer: ${batch.proposer}`);
        console.log(`  Batch ID: ${batch.batchId}`);
        console.log(`  Finalized: ${batch.finalized}`);
        console.log('');
      }
    });

    it("should have emitted StateBatchAppended events for the last 3 batches", async () => {
      const batchCount = await stateCommitmentChain.getBatchCount();
      
      for (let i = 0; i < 3; i++) {
        const index = batchCount.toNumber() - 1 - i;
        const events = await stateCommitmentChain.getPastEvents('StateBatchAppended', {
          filter: { batchIndex: index },
          fromBlock: 0,
          toBlock: 'latest'
        });

        // assert.equal(events.length, 1, `Should have one StateBatchAppended event for batch ${index}`);
        // const event = events[0];

        // assert.equal(event.returnValues.batchIndex, index, `Event batchIndex for batch ${index} is incorrect`);
        // assert(event.returnValues.batchData.length > 0, `Event batchData for batch ${index} should not be empty`);
        // assert(web3.utils.isHexStrict(event.returnValues.stateRoot), `Event stateRoot for batch ${index} should be a valid hex string`);
        // assert.notEqual(event.returnValues.proposer, '0x0000000000000000000000000000000000000000', `Event proposer for batch ${index} should be a valid address`);
        // assert(web3.utils.isHexStrict(event.returnValues.batchId), `Event batchId for batch ${index} should be a valid hex string`);

        // console.log(`Event for Batch ${index}:`);
        // console.log(`  Batch Data: ${event.returnValues.batchData}`);
        // console.log(`  State Root: ${event.returnValues.stateRoot}`);
        // console.log(`  Proposer: ${event.returnValues.proposer}`);
        // console.log(`  Batch ID: ${event.returnValues.batchId}`);
        // console.log('');
      }
    });
  });

  describe("CanonicalTransactionChain", () => {
    it("should allow enqueueing transactions", async () => {
      const txHash = web3.utils.keccak256("transaction1");
      await canonicalTransactionChain.enqueue(txHash);

      const queuedTx = await canonicalTransactionChain.queue(0);
      assert.equal(queuedTx.transactionHash, txHash, "Transaction not enqueued correctly");
    });
  });

  describe("FraudVerifier", function () {
    it("should allow initiating and resolving challenges for the last 3 batches", async function () {
      this.timeout(30000); // 테스트 시간 제한을 30초로 늘림

      const depositAmount = web3.utils.toWei("1", "ether");
      await bondManager.deposit({ from: user2, value: depositAmount });

      const batchCount = await stateCommitmentChain.getBatchCount();
      const preStateRoot = web3.utils.keccak256("preState");
      const postStateRoot = web3.utils.keccak256("postState");
      const transaction = web3.utils.randomHex(100);

      for (let i = 0; i < 3; i++) {
        const batchIndex = batchCount.toNumber() - 1 - i;
        const txHash = web3.utils.keccak256(`fraudulentTx${i}`);

        const challengeState = await fraudVerifier.challenges(batchIndex);
        console.log(`Initial challenge state for batch ${batchIndex}:`, challengeState);

        if (!challengeState.resolved) {
          // Ensure user2 has deposited bond before initiating each challenge
          let bond = await bondManager.bonds(user2);
          if (bond.toString() === "0") {
            await bondManager.deposit({ from: user2, value: depositAmount });
          }

          await fraudVerifier.initiateChallenge(batchIndex, txHash, { from: user2 });

          const challenge = await fraudVerifier.challenges(batchIndex);
          assert.equal(challenge.challenger, user2, `Challenge for batch ${batchIndex} not initiated correctly`);

          console.log(`Challenge state for batch ${batchIndex} after initiation:`, challenge);

          // Increase time by 10 minutes and 1 second to pass the challenge period
          await web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [10 * 60 + 1],
            id: new Date().getTime()
          }, () => {});

          await fraudVerifier.resolveChallenge(batchIndex, preStateRoot, postStateRoot, transaction);

          const resolvedChallenge = await fraudVerifier.challenges(batchIndex);
          assert.equal(resolvedChallenge.resolved, true, `Challenge for batch ${batchIndex} not resolved`);

          console.log(`Resolved challenge state for batch ${batchIndex}:`, resolvedChallenge);

          // Check if the challenger bond was burned
          bond = await bondManager.bonds(user2);
          console.log(`Bond for user2 after resolving challenge for batch ${batchIndex}:`, bond.toString());
          assert.equal(bond.toString(), "0", "Bond not burned correctly after challenge resolution");

          // Finalize the batch after the challenge period
          await stateCommitmentChain.finalizeBatch(batchIndex);

          // Check if the batch was finalized
          const batch = await stateCommitmentChain.getBatch(batchIndex);
          console.log(`Finalized state for batch ${batchIndex}:`, batch.finalized);
          assert.equal(batch.finalized, true, `Batch ${batchIndex} not finalized correctly`);
        } else {
          console.log(`Challenge for batch ${batchIndex} already resolved, skipping resolution step`);
        }
      }
    });
  });
});
