const StateCommitmentChain = artifacts.require("StateCommitmentChain");
const BondManager = artifacts.require("BondManager");
const CanonicalTransactionChain = artifacts.require("CanonicalTransactionChain");
const FraudVerifier = artifacts.require("FraudVerifier");

contract("Rollup Contracts", accounts => {
  let stateCommitmentChain, bondManager, canonicalTransactionChain, fraudVerifier;
  const [owner, user1, user2] = accounts;

  before(async () => {
    stateCommitmentChain = await StateCommitmentChain.deployed();
    bondManager = await BondManager.deployed();
    canonicalTransactionChain = await CanonicalTransactionChain.deployed();
    fraudVerifier = await FraudVerifier.deployed();
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

  describe("StateCommitmentChain", () => {
    it("should allow appending and finalizing state batches", async () => {
      const batch = [web3.utils.keccak256("state1"), web3.utils.keccak256("state2")];
      await stateCommitmentChain.appendStateBatch(batch, user1, { from: owner });

      const appendedBatch = await stateCommitmentChain.batches(0);
      assert.equal(appendedBatch.stateRoot, batch[0], "State batch not appended correctly");

      // Increase time to pass challenge period
      await web3.currentProvider.send({
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [7 * 24 * 60 * 60 + 1], // 7 days + 1 second
        id: new Date().getTime()
      }, () => {});

      await stateCommitmentChain.finalizeBatch(0);
      const finalizedBatch = await stateCommitmentChain.batches(0);
      assert.equal(finalizedBatch.finalized, true, "Batch not finalized");
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

  describe("FraudVerifier", () => {
    it("should allow initiating and resolving challenges", async () => {
      const batchIndex = 0;
      const txHash = web3.utils.keccak256("fraudulentTx");

      // Deposit bond for the challenger
      await bondManager.deposit({ from: user2, value: web3.utils.toWei("1", "ether") });

      await fraudVerifier.initiateChallenge(batchIndex, txHash, { from: user2 });

      const challenge = await fraudVerifier.challenges(batchIndex);
      assert.equal(challenge.challenger, user2, "Challenge not initiated correctly");

      // Increase time to pass challenge period
      await web3.currentProvider.send({
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [7 * 24 * 60 * 60 + 1], // 7 days + 1 second
        id: new Date().getTime()
      }, () => {});

      // For this test, we'll assume the challenge is successful
      const preStateRoot = web3.utils.keccak256("preState");
      const postStateRoot = web3.utils.keccak256("postState");
      const transaction = web3.utils.randomHex(100); // Mock transaction data

      await fraudVerifier.resolveChallenge(batchIndex, preStateRoot, postStateRoot, transaction);

      const resolvedChallenge = await fraudVerifier.challenges(batchIndex);
      assert.equal(resolvedChallenge.resolved, true, "Challenge not resolved");
    });
  });
});