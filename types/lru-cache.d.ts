declare module "lru-cache" {
  export interface LRUCacheOptions<K, V> {
    max: number;
  }

  export class LRUCache<K, V> {
    constructor(options: LRUCacheOptions<K, V>);
    has(key: K): boolean;
    get(key: K): V | undefined;
    set(key: K, value: V): this;
  }
}
