const { execSync } = require("child_process");


const runTypeChain = () => {
  const command = "npx typechain --target truffle-v5 --out-dir types/truffle-contracts 'build/contracts/*.json'";
  execSync(command, { stdio: "inherit" });
};

const main = () => {
  runTypeChain();
  console.log("Types generated successfully")
};

main();
