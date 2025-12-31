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
	let state = { status: "pending" };
	let waiting = [];
	function flush() {
		const queued = waiting;
		waiting = [];
		if (state.status === "resolved") for (const { resolve } of queued) resolve(state.value);
		else if (state.status === "rejected") for (const { reject } of queued) reject(state.error);
	}
	async function emit(input) {
		const prev = state.status === "resolved" ? state.value : void 0;
		let next;
		try {
			if (typeof input === "function") next = await input(prev);
			else next = await input;
		} catch (err) {
			_throw(err);
			return;
		}
		const equals = options.equality ?? (() => false);
		if (state.status === "resolved" && equals(next, state.value)) return;
		if (options.shouldAccept && !options.shouldAccept(next, prev)) return;
		state = {
			status: "resolved",
			value: next
		};
		flush();
		if (options.afterEmit) queueMicrotask(() => options.afterEmit(next, prev));
	}
	function _throw(error) {
		state = {
			status: "rejected",
			error
		};
		flush();
		if (options.afterThrow) queueMicrotask(() => options.afterThrow(error));
	}
	function get() {
		if (state.status === "resolved") return Promise.resolve(state.value);
		if (state.status === "rejected") return Promise.reject(state.error);
		return new Promise((resolve, reject) => {
			waiting.push({
				resolve,
				reject
			});
		});
	}
	return {
		emit,
		throw: _throw,
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
	globalEmitSubs = /* @__PURE__ */ new Set();
	globalErrorSubs = /* @__PURE__ */ new Set();
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
	onEveryEmit(fn) {
		this.globalEmitSubs.add(fn);
		return () => {
			this.globalEmitSubs.delete(fn);
		};
	}
	onEveryError(fn) {
		this.globalErrorSubs.add(fn);
		return () => {
			this.globalErrorSubs.delete(fn);
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
		const waitable = createWaitable({
			equality: this.config?.equality,
			shouldAccept: () => running,
			afterEmit: (next, prev) => {
				refs.forEach((ref) => ref.notifyEmit(next, prev));
				this.globalEmitSubs.forEach((fn) => fn(next, prev, ctx, key));
			},
			afterThrow: (err) => {
				refs.forEach((ref) => ref.notifyError(err));
				this.globalErrorSubs.forEach((fn) => fn(err, ctx, key));
			}
		});
		const { emit, get } = waitable;
		Promise.resolve().then(() => this.init({
			emit,
			retain,
			key
		}, ctx)).catch((err) => {
			waitable.throw(err);
		}).then(() => {
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
		const emitSubs = /* @__PURE__ */ new Set();
		const errorSubs = /* @__PURE__ */ new Set();
		const refEntry = {
			notifyEmit: (v, prev) => {
				emitSubs.forEach((fn) => fn(v, prev));
			},
			notifyError: (err) => {
				errorSubs.forEach((fn) => fn(err));
			}
		};
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
			onEmit(fn) {
				emitSubs.add(fn);
				return () => emitSubs.delete(fn);
			},
			onError(fn) {
				errorSubs.add(fn);
				return () => errorSubs.delete(fn);
			},
			reuse(ctx) {
				changeInstance(ctx);
			},
			[Symbol.dispose]() {
				instance.refs.delete(ref);
				if (instance.refs.size === 0) instance.close();
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