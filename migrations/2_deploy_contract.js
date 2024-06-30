const CanonicalTransactionChain = artifacts.require("CanonicalTransactionChain");
const StateCommitmentChain = artifacts.require("StateCommitmentChain");
const BondManager = artifacts.require("BondManager");
const FraudVerifier = artifacts.require("FraudVerifier");

module.exports = async function (deployer) {
    try {
        // StateCommitmentChain 배포 확인 및 배포
        let stateInstance = await StateCommitmentChain.deployed().catch(() => null);
        if (!stateInstance) {
            await deployer.deploy(StateCommitmentChain, { gas: 6000000 });
            stateInstance = await StateCommitmentChain.deployed();
            console.log("StateCommitmentChain 배포 완료:", stateInstance.address);
        } else {
            console.log("StateCommitmentChain 이미 배포됨:", stateInstance.address);
        }

        // CanonicalTransactionChain 배포 확인 및 배포
        let canonicalInstance = await CanonicalTransactionChain.deployed().catch(() => null);
        if (!canonicalInstance) {
            await deployer.deploy(CanonicalTransactionChain);
            canonicalInstance = await CanonicalTransactionChain.deployed();
            console.log("CanonicalTransactionChain 배포 완료:", canonicalInstance.address);
        } else {
            console.log("CanonicalTransactionChain 이미 배포됨:", canonicalInstance.address);
        }

        // BondManager 배포 확인 및 배포
        let bondInstance = await BondManager.deployed().catch(() => null);
        if (!bondInstance) {
            await deployer.deploy(BondManager);
            bondInstance = await BondManager.deployed();
            console.log("BondManager 배포 완료:", bondInstance.address);
        } else {
            console.log("BondManager 이미 배포됨:", bondInstance.address);
        }

        // FraudVerifier 배포 확인 및 배포
        let fraudInstance = await FraudVerifier.deployed().catch(() => null);
        if (!fraudInstance) {
            await deployer.deploy(FraudVerifier, stateInstance.address, canonicalInstance.address, bondInstance.address);
            fraudInstance = await FraudVerifier.deployed();
            console.log("FraudVerifier 배포 완료:", fraudInstance.address);
        } else {
            console.log("FraudVerifier 이미 배포됨:", fraudInstance.address);
        }
    } catch (error) {
        console.error("배포 중 에러 발생:", error);
    }
};
