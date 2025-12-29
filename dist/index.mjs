import { createHash } from "crypto";

//#region src/lib/stringify.ts
var ReferenceRegistry = class {
	refCount = 0;
	refs = /* @__PURE__ */ new WeakMap();
	constructor(allowPredicate) {
		this.allowPredicate = allowPredicate;
	}
	getId(obj) {
		if (!this.allowPredicate(obj)) return void 0;
		if (!this.refs.has(obj)) {
			this.refCount++;
			this.refs.set(obj, `__ref_${this.refCount}__`);
		}
		return this.refs.get(obj);
	}
};
const registry = new ReferenceRegistry((obj) => {
	return typeof obj === "function" || obj && typeof obj === "object" && obj.constructor !== Object || typeof obj === "symbol";
});
function stableStringify(data) {
	const seen = [];
	function stringifyInternal(node) {
		if (node && typeof node.toJSON === "function") node = node.toJSON();
		if (registry && node && typeof node === "object") {
			const refId = registry.getId(node);
			if (refId) return JSON.stringify(refId);
		}
		if (typeof node === "function") {
			const refId = registry.getId(node);
			if (refId) return JSON.stringify(refId);
			return;
		}
		if (typeof node === "bigint") return `"${node.toString()}n"`;
		if (node === void 0) return void 0;
		if (typeof node !== "object" || node === null) {
			if (typeof node === "number" && !Number.isFinite(node)) return "null";
			return JSON.stringify(node);
		}
		if (Array.isArray(node)) return `[${node.map((v) => stringifyInternal(v) ?? "null").join(",")}]`;
		if (seen.includes(node)) return JSON.stringify("__cycle__");
		if (node instanceof Date) return `"${node.toISOString()}"`;
		if (node instanceof RegExp) return JSON.stringify(node.toString());
		if (node instanceof Map) return `[${Array.from(node.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, v]) => `[${stringifyInternal(k)},${stringifyInternal(v)}]`).join(",")}]`;
		if (node instanceof Set) return `[${Array.from(node.values()).sort((a, b) => String(a).localeCompare(String(b))).map((v) => stringifyInternal(v)).join(",")}]`;
		seen.push(node);
		const keys = Object.keys(node).sort();
		const parts = [];
		for (const key of keys) {
			const val = stringifyInternal(node[key]);
			if (val !== void 0) parts.push(`${JSON.stringify(key)}:${val}`);
		}
		seen.pop();
		return `{${parts.join(",")}}`;
	}
	return stringifyInternal(data) || "null";
}
function stableHash(data) {
	const json = stableStringify(data);
	return createHash("sha256").update(json).digest("hex");
}

//#endregion
//#region src/lib/waitable.ts
function createWaitable(options = {}) {
	let latest;
	let initialized = false;
	let waiting = [];
	async function emit(input) {
		const prev = latest;
		let next;
		try {
			if (typeof input === "function") next = await input(prev);
			else next = await input;
		} catch {
			return;
		}
		const equals = options.equality ?? (() => false);
		if (initialized && equals(next, prev)) return;
		if (options.shouldAccept && !options.shouldAccept(next, prev)) return;
		latest = next;
		initialized = true;
		const queued = waiting;
		waiting = [];
		for (const resolve of queued) resolve(next);
		if (options.afterEmit) queueMicrotask(() => options.afterEmit(next, prev));
	}
	function get() {
		if (initialized) return Promise.resolve(latest);
		return new Promise((resolve) => {
			waiting.push(resolve);
		});
	}
	return {
		emit,
		get
	};
}

//#endregion
//#region src/resource.ts
const emptyInstance = {
	key: "",
	refs: /* @__PURE__ */ new Map(),
	running: false,
	get: async () => {
		throw new Error("Called get on empty Resource ref");
	},
	close: () => {},
	retain: async () => {},
	untilClose: Promise.resolve(),
	untilRetain: Promise.resolve(),
	untilFinish: Promise.resolve()
};
var Resource = class {
	globalSubs = /* @__PURE__ */ new Set();
	instances = /* @__PURE__ */ new Map();
	constructor(init, config) {
		this.init = init;
		this.config = config;
	}
	get name() {
		return this.config?.name;
	}
	use(ctx) {
		const instance = this.prepareInstance(ctx);
		return this.createRef({ instance });
	}
	empty() {
		return this.createRef({ instance: emptyInstance });
	}
	subscribeAll(fn) {
		this.globalSubs.add(fn);
		return () => {
			this.globalSubs.delete(fn);
		};
	}
	prepareInstance(ctx) {
		const key = `${this.config?.name ?? "unknown"}:${stableHash(ctx)}`;
		if (this.instances.get(key)) return this.instances.get(key);
		let running = true;
		let resolveClose;
		const untilClose = new Promise((r) => resolveClose = r);
		const close = () => {
			if (!running) return;
			this.instances.delete(key);
			running = false;
			resolveClose();
		};
		let resolveRetain;
		const untilRetain = new Promise((r) => resolveRetain = r);
		const retain = async () => {
			resolveRetain();
			await untilClose;
		};
		let resolveFinish;
		const untilFinish = new Promise((r) => resolveFinish = r);
		const refs = /* @__PURE__ */ new Map();
		const { emit, get } = createWaitable({
			equality: this.config?.equality,
			shouldAccept: () => running,
			afterEmit: (next, prev) => {
				refs.forEach((ref) => ref.notify(next, prev));
				this.globalSubs.forEach((fn) => fn(next, prev, key));
			}
		});
		Promise.resolve(this.init({
			emit,
			retain,
			key
		}, ctx)).then(() => {
			resolveRetain();
			resolveFinish();
		});
		const instance = {
			key,
			refs,
			running,
			get,
			close,
			retain,
			untilClose,
			untilRetain,
			untilFinish
		};
		this.instances.set(key, instance);
		return instance;
	}
	createRef(args) {
		let instance = args.instance;
		const ref = Symbol();
		const subs = /* @__PURE__ */ new Set();
		const refEntry = { notify: (v) => {
			subs.forEach((fn) => fn(v));
		} };
		instance.refs.set(ref, refEntry);
		const changeInstance = async (ctx) => {
			const newInstance = this.prepareInstance(ctx);
			if (newInstance === instance) return;
			await newInstance.untilRetain;
			newInstance.refs.set(ref, refEntry);
			instance.refs.delete(ref);
			instance.close();
			instance = newInstance;
		};
		return {
			get key() {
				return instance.key;
			},
			get value() {
				return instance.get();
			},
			subscribe(fn) {
				subs.add(fn);
				return () => subs.delete(fn);
			},
			reuse(ctx) {
				changeInstance(ctx);
			},
			[Symbol.dispose]() {
				instance.refs.delete(ref);
				if (instance.refs.size === 0) instance.close();
			},
			async [Symbol.asyncDispose]() {
				instance.refs.delete(ref);
				if (instance.refs.size === 0) {
					instance.close();
					await instance.untilFinish;
				}
			}
		};
	}
};

//#endregion
//#region src/action.ts
var Action = class {
	refs = /* @__PURE__ */ new Map();
	value;
	get latestValue() {
		return this.value;
	}
	emit(value) {
		for (const { notify } of this.refs.values()) {
			this.value = value;
			notify(value);
		}
	}
	use() {
		const id = Symbol();
		const subs = /* @__PURE__ */ new Set();
		this.refs.set(id, { notify: (v) => {
			subs.forEach((fn) => fn(v));
		} });
		return {
			subscribe(fn) {
				subs.add(fn);
			},
			[Symbol.dispose]: () => {
				this.refs.delete(id);
			}
		};
	}
};

//#endregion
export { Action, Resource };
//# sourceMappingURL=index.mjs.map