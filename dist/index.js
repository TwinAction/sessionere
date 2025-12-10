//#region src/planner.ts
var Planner = class {
	calls = /* @__PURE__ */ new Set();
	cleanups = /* @__PURE__ */ new Set();
	constructor(options) {
		this.options = options;
	}
	get into() {
		return (call, cleanup) => {
			this.calls.add(call);
			if (this.calls.size === 1) this.start();
			const remove = () => {
				this.calls.delete(call);
				if (this.calls.size === 0) this.cleanup();
			};
			cleanup(remove);
		};
	}
	start() {
		if (this.options.timeout) {
			const timeout = setTimeout(() => this.call(), this.options.timeout);
			this.cleanups.add(() => clearTimeout(timeout));
		}
		if (this.options.interval) {
			const timeout = setInterval(() => this.call(), this.options.interval);
			this.cleanups.add(() => clearInterval(timeout));
		}
	}
	call() {
		this.calls.forEach((fn) => {
			try {
				fn();
			} catch {}
		});
	}
	cleanup() {
		this.cleanups.forEach((fn) => {
			try {
				fn();
			} catch {}
		});
		this.cleanups.clear();
	}
};

//#endregion
//#region src/lib/stringify.ts
function stableStringify(data) {
	const seen = [];
	function stringifyInternal(node) {
		if (node && typeof node.toJSON === "function") node = node.toJSON();
		if (typeof node === "bigint") return `"${node.toString()}n"`;
		if (node === void 0 || typeof node === "function") return;
		if (typeof node !== "object" || node === null) {
			if (typeof node === "number" && !Number.isFinite(node)) return "null";
			return JSON.stringify(node);
		}
		if (Array.isArray(node)) {
			let out$1 = "[";
			for (let i = 0; i < node.length; i++) {
				if (i > 0) out$1 += ",";
				const value = stringifyInternal(node[i]);
				out$1 += value === void 0 ? "null" : value;
			}
			return out$1 + "]";
		}
		if (seen.includes(node)) return JSON.stringify("__cycle__");
		if (node instanceof Date) return `"${node.toISOString()}"`;
		if (node instanceof RegExp) return JSON.stringify(node.toString());
		if (node instanceof Map) {
			const sortedEntries = Array.from(node.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
			let out$1 = "[";
			for (let i = 0; i < sortedEntries.length; i++) {
				if (i > 0) out$1 += ",";
				const [map_key, map_value] = sortedEntries[i];
				out$1 += `[${stringifyInternal(map_key)},${stringifyInternal(map_value)}]`;
			}
			return out$1 + "]";
		}
		if (node instanceof Set) {
			const sortedValues = Array.from(node.values()).sort((a, b) => {
				return String(a).localeCompare(String(b));
			});
			let out$1 = "[";
			for (let i = 0; i < sortedValues.length; i++) {
				if (i > 0) out$1 += ",";
				out$1 += stringifyInternal(sortedValues[i]);
			}
			return out$1 + "]";
		}
		const seenIndex = seen.push(node) - 1;
		const keys = Object.keys(node).sort();
		let out = "";
		let first = true;
		for (const key of keys) {
			const value = stringifyInternal(node[key]);
			if (value === void 0) continue;
			if (!first) out += ",";
			first = false;
			out += JSON.stringify(key) + ":" + value;
		}
		seen.splice(seenIndex, 1);
		return "{" + out + "}";
	}
	return stringifyInternal(data) || "null";
}

//#endregion
//#region src/lib/stream.ts
function promiseStream(asyncGenerator) {
	let resolveInitialValue;
	let value = new Promise((resolve) => {
		resolveInitialValue = resolve;
	});
	function call() {
		(async () => {
			const result = await asyncGenerator.next();
			if (result.done) return;
			if (resolveInitialValue) {
				resolveInitialValue(result.value);
				resolveInitialValue = void 0;
			} else value = Promise.resolve(result.value);
		})();
	}
	function getValue() {
		return value;
	}
	return {
		call,
		getValue
	};
}

//#endregion
//#region src/resource.ts
var Resource = class {
	instances = /* @__PURE__ */ new Map();
	constructor(init) {
		this.init = init;
	}
	async use(ctx) {
		const key = stableStringify(ctx);
		const instance = this.instances.get(key) ?? await this.createInstance(key, ctx);
		instance.refCount++;
		return this.createHandle(instance);
	}
	async createInstance(key, ctx) {
		let get;
		let close;
		let running = true;
		const provider = ({ handler, planner }) => {
			const { call, getValue } = this.createStream(handler, () => running);
			const cleanup = [];
			get = getValue;
			planner(call, (fn) => cleanup.push(fn));
			return new Promise((resolve) => {
				close = () => {
					cleanup.forEach((fn) => fn());
					this.instances.delete(key);
					if (running) resolve();
					running = false;
				};
			});
		};
		await this.init(provider, ctx);
		const instance = {
			refCount: 0,
			running,
			close,
			get
		};
		this.instances.set(key, instance);
		return instance;
	}
	createStream(handler, isRunning) {
		return promiseStream((async function* () {
			while (isRunning()) {
				const t = await handler();
				if (!isRunning()) return;
				yield t;
			}
		})());
	}
	createHandle(instance) {
		return {
			get value() {
				return instance.get();
			},
			async [Symbol.asyncDispose]() {
				instance.refCount--;
				if (instance.refCount === 0) instance.close();
			}
		};
	}
};

//#endregion
export { Planner, Resource };
//# sourceMappingURL=index.js.map