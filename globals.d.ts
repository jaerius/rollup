// globals.d.ts
import { Artifacts } from "truffle";
import Web3 from "web3";

declare global {
  const artifacts: Artifacts;
  const contract: any;
  const web3: Web3;
}

export {};
