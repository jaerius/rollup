import {Transaction, SignedTransaction, UnsignedTransaction} from './types/Transactions';

export const TYPED_DATA_TYPES = {
    UnsignedTransaction: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint64' },
      { name: 'nonce', type: 'uint64' },
      { name: 'fee', type: 'uint64' },
    ],
  }

export interface Batch {
    proposer: string;
    timestamp: Date;
    calldata: string;
}

