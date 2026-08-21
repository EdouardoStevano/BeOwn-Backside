export const HASHING_SERVICE = Symbol('HASHING_SERVICE');

export interface HashingService {
  hash(data: string | Buffer): Promise<string>;
  compare(data: string | Buffer, encrypted: string): Promise<boolean>;
}
