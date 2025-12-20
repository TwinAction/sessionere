type Subscriber<T> = (value: T) => void;

export class Action<T> {
  private refs = new Map<symbol, { notify: Subscriber<T> }>();
  private value?: T;

  get latestValue() {
    return this.value;
  }

  emit(value: T) {
    for (const { notify } of this.refs.values()) {
      this.value = value;
      notify(value);
    }
  }

  use() {
    const id = Symbol();
    const subs = new Set<Subscriber<T>>();

    const entry = {
      notify: (v: T) => {
        subs.forEach((fn) => fn(v));
      },
    };

    this.refs.set(id, entry);

    return {
      subscribe(fn: Subscriber<T>) {
        subs.add(fn);
      },

      [Symbol.dispose]: () => {
        this.refs.delete(id);
      },
    };
  }
}
