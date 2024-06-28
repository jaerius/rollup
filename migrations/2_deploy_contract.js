const CanonicalTransactionChain = artifacts.require("CanonicalTransactionChain");
const StateCommitmentChain = artifacts.require("StateCommitmentChain");
const BondManager = artifacts.require("BondManager");
const FraudVerifier = artifacts.require("FraudVerifier");

module.exports = function (deployer) {
    deployer.deploy(StateCommitmentChain, { gas: 6000000 })
      .then(() => {
        try{
        console.log("StateCommitmentChain 배포 완료:", StateCommitmentChain.address);
        return deployer.deploy(CanonicalTransactionChain);
        } catch (error) {
          console.log(error);
        }
      })
      .then(() => {
        console.log("CanonicalTransactionChain 배포 완료:", CanonicalTransactionChain.address);
        return deployer.deploy(BondManager);
      })
      .then(() => {
        console.log("BondManager 배포 완료:", BondManager.address);
        return deployer.deploy(FraudVerifier, StateCommitmentChain.address, CanonicalTransactionChain.address, BondManager.address);
      })
      .then(() => {
        console.log("FraudVerifier 배포 완료:", FraudVerifier.address);
      });
};
