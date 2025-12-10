export type PlannerCB = (
  call: () => void,
  cleanup: (fn: () => void) => void
) => void;

export class Planner {
  private calls = new Set<() => void>();
  private cleanups = new Set<() => void>();

  constructor(
    private readonly options: {
      timeout?: number;
      interval?: number;
    }
  ) {}

  get into(): PlannerCB {
    return (call, cleanup) => {
      this.calls.add(call);

      if (this.calls.size === 1) {
        this.start();
      }

      const remove = () => {
        this.calls.delete(call);
        if (this.calls.size === 0) {
          this.cleanup();
        }
      };
      cleanup(remove);
    };
  }

  private start() {
    if (this.options.timeout) {
      const timeout = setTimeout(() => this.call(), this.options.timeout);
      this.cleanups.add(() => clearTimeout(timeout));
    }
    if (this.options.interval) {
      const timeout = setInterval(() => this.call(), this.options.interval);
      this.cleanups.add(() => clearInterval(timeout));
    }
  }

  private cleanup() {
    this.cleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    this.cleanups.clear();
  }

  call() {
    this.calls.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }
}
