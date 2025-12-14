type Subscriber<T> = (value: T) => void;

export class Action<T> {
  private refs = new Map<symbol, { notify: Subscriber<T> }>();

  emit(value: T) {
    for (const { notify } of this.refs.values()) {
      notify(value);
    }
  }

  sub(fn: Subscriber<T>) {
    const id = Symbol();

    this.refs.set(id, {
      notify: fn,
    });

    return {
      unsub() {
        this[Symbol.dispose]();
      },
      [Symbol.dispose]: () => {
        this.refs.delete(id);
      },
    };
  }
}
