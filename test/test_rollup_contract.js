const StateCommitmentChain = artifacts.require("StateCommitmentChain");
const BondManager = artifacts.require("BondManager");
const CanonicalTransactionChain = artifacts.require("CanonicalTransactionChain");
const FraudVerifier = artifacts.require("FraudVerifier");
const fs = require('fs');
const path = require('path');

contract("Rollup Contracts", accounts => {
  let stateCommitmentChain, bondManager, canonicalTransactionChain, fraudVerifier;
  const [owner, user1, user2, user3] = accounts;
  let realBatchData;

  before(async () => {
    stateCommitmentChain = await StateCommitmentChain.deployed();
    bondManager = await BondManager.deployed();
    canonicalTransactionChain = await CanonicalTransactionChain.deployed();
    fraudVerifier = await FraudVerifier.deployed();

    const filePath = path.join(__dirname, '../src/eventData.json');
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      realBatchData = JSON.parse(fileContent);
    } else {
      throw new Error(`File not found: ${filePath}`);
    }
  });

  beforeEach(async () => {
    const depositAmount = web3.utils.toWei("1", "ether");
    
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
      assert.equal(bond.toString(), depositAmount, "Bond not deposited correctly");

      await bondManager.withdraw(depositAmount, { from: user1 });
      
      bond = await bondManager.bonds(user1);
      assert.equal(bond.toString(), "0", "Bond not withdrawn correctly");
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

  describe("StateCommitmentChain and FraudVerifier", function () {
    it("should allow appending batches, initiating challenges, resolving them, and finally finalizing batches", async function () {
      this.timeout(60000);

      const depositAmount = web3.utils.toWei("1", "ether");
      await bondManager.deposit({ from: user2, value: depositAmount });

      assert(realBatchData.length >= 3, "There should be at least 3 batches in the JSON data");

      // Append batches without finalizing
      for (const batch of realBatchData.slice(-3)) {
        await stateCommitmentChain.appendStateBatch(
          batch.calldata,
          batch.stateRoot,
          batch.proposer,
          batch.batchId
        );
      }

      // Now initiate and resolve challenges for each batch
      for (let i = 0; i < 3; i++) {
        const batchIndex = realBatchData.length - 3 + i;
        const batch = realBatchData[batchIndex];

        console.log(`Processing batch ${batchIndex}`);

        // Check if the batch is already finalized
        const { finalized } = await stateCommitmentChain.getBatch(batch.index);
        if (finalized) {
          console.log(`Batch ${batchIndex} is already finalized, skipping challenge`);
          continue;
        }

        // Initiate challenge
        await fraudVerifier.initiateChallenge(batch.index, batch.batchId, { from: user2 });

        const challenge = await fraudVerifier.challenges(batch.index);
        assert.equal(challenge.challenger, user2, `Challenge for batch ${batch.index} not initiated correctly`);

        console.log(`Challenge state for batch ${batch.index} after initiation:`, challenge);

        // Increase time to pass challenge period
        await web3.currentProvider.send({
          jsonrpc: '2.0',
          method: 'evm_increaseTime',
          params: [10 * 60 + 1],
          id: new Date().getTime()
        }, () => {});

        // Resolve challenge
        await fraudVerifier.resolveChallenge(batch.batchId, batch.stateRoot, batch.stateRoot, batch.calldata, batch.stateRoot, (await web3.eth.getBlock('latest')).timestamp, batch.proposer);

        const resolvedChallenge = await fraudVerifier.challenges(batch.index);
        assert.equal(resolvedChallenge.resolved, true, `Challenge for batch ${batch.index} not resolved`);

        console.log(`Resolved challenge state for batch ${batch.index}:`, resolvedChallenge);

        // Check bond
        const bond = await bondManager.bonds(user2);
        console.log(`Bond for user2 after resolving challenge for batch ${batch.index}:`, bond.toString());
        assert.equal(bond.toString(), "0", "Bond not burned correctly after challenge resolution");

        // Now finalize the batch
        await stateCommitmentChain.finalizeBatch(batch.batchId, batch.stateRoot, (await web3.eth.getBlock('latest')).timestamp, batch.proposer);

        const finalizedBatch = await stateCommitmentChain.getBatch(batch.index);
        console.log(`Finalized state for batch ${batch.index}:`, finalizedBatch.finalized);
        assert.equal(finalizedBatch.finalized, true, `Batch ${batch.index} not finalized correctly`);
      }

      // Verify the final state
      const finalBatchCount = await stateCommitmentChain.getFinalizedBatchCount();
      assert.equal(finalBatchCount.toNumber(), realBatchData.length, "All batches should be finalized");

      for (let i = 0; i < 3; i++) {
        const index = realBatchData.length - 3 + i;
        const batch = await stateCommitmentChain.getBatch(index);
        const originalBatch = realBatchData[index];

        assert.equal(batch.stateRoot, originalBatch.stateRoot, `Batch ${index} state root should match`);
        assert.equal(batch.proposer, originalBatch.proposer, `Batch ${index} proposer should match`);
        assert.equal(batch.batchId, originalBatch.batchId, `Batch ${index} ID should match`);
        assert.equal(batch.finalized, true, `Batch ${index} should be finalized`);
      }
    });
  });
});
