export class BiMap<L, R> {
  private left: Map<L, R>;
  private right: Map<R, L>;

  constructor(entries?: readonly (readonly [L, R])[] | null) {
    this.left = new Map();
    this.right = new Map();

    if (entries) {
      for (const [l, r] of entries) {
        this.set(l, r);
      }
    }
  }

  set(l: L, r: R): void {
    const existingR = this.left.get(l);
    if (existingR !== undefined) {
      this.right.delete(existingR);
    }

    const existingL = this.right.get(r);
    if (existingL !== undefined) {
      this.left.delete(existingL);
    }

    this.left.set(l, r);
    this.right.set(r, l);
  }

  getRight(l: L): R | undefined {
    return this.left.get(l);
  }

  getLeft(r: R): L | undefined {
    return this.right.get(r);
  }

  deleteByLeft(l: L): boolean {
    const r = this.left.get(l);
    if (r !== undefined) {
      this.left.delete(l);
      this.right.delete(r);
      return true;
    }
    return false;
  }

  deleteByRight(r: R): boolean {
    const l = this.right.get(r);
    if (l !== undefined) {
      this.right.delete(r);
      this.left.delete(l);
      return true;
    }
    return false;
  }

  hasLeft(l: L): boolean {
    return this.left.has(l);
  }

  hasRight(r: R): boolean {
    return this.right.has(r);
  }

  clear(): void {
    this.left.clear();
    this.right.clear();
  }

  lefts(): IterableIterator<L> {
    return this.left.keys();
  }

  rights(): IterableIterator<R> {
    return this.left.values();
  }

  pairs(): IterableIterator<[L, R]> {
    return this.left.entries();
  }

  get size(): number {
    return this.left.size;
  }
}
