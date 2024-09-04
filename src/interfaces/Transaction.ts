export interface UnsignedTransaction {
  // 트랜잭션 기본 구성 필드
  to: string;
  amount: bigint;
  fee: bigint;
  nonce: bigint;
  data: string;
  gasPrice: bigint;
  gasLimit: bigint;
  chainId: number;
}

export interface Transaction extends UnsignedTransaction {
  // 트랜잭션 검증용 필드
  from: string;
  hash: string;
}

export interface SignedTransaction extends Transaction {
  // 서명 이후 추가되는 필드
  v: number;
  r: string;
  s: string;
}
