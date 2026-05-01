declare module "fuse.js" {
  export interface FuseResult<T> {
    item: T;
    refIndex: number;
    score?: number;
  }

  export interface FuseOptions<T> {
    keys?: Array<keyof T | string>;
    threshold?: number;
    distance?: number;
    includeScore?: boolean;
    minMatchCharLength?: number;
  }

  export default class Fuse<T> {
    constructor(list: T[], options?: FuseOptions<T>);
    search(pattern: string): FuseResult<T>[];
  }
}
