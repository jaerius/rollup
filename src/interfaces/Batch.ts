export interface Batch {
  proposer: string;
  timestamp: number;
  calldata: string;
  batchId: string;
}

export interface ctcBatch {
  calldata: string;
  startIndex: number;
  endIndex: number;
}
