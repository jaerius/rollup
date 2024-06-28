import { ethers } from 'ethers';
type address = string;


export interface UnsignedTransaction {
    to: address;
    value: bigint;
    nonce: bigint;
    fee: bigint;
}

export interface SignedTransaction extends Transaction {
    v: number;
    r: string;
    s: string;
}

export interface Transaction extends UnsignedTransaction {
    from : address;
    hash: string;
}
