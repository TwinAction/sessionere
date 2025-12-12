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
const registry = new ReferenceRegistry((obj) => typeof obj === "function" || obj instanceof Resource);
function stableStringify(data) {
	const seen = [];
	function stringifyInternal(node) {
		if (node && typeof node.toJSON === "function") node = node.toJSON();
		if (registry && node && typeof node === "object") {
			const refId = registry.getId(node);
			if (refId) return JSON.stringify(refId);
		}
		if (typeof node === "function") {
			if (registry) {
				const refId = registry.getId(node);
				if (refId) return JSON.stringify(refId);
			}
			return;
		}
		if (typeof node === "bigint") return `"${node.toString()}n"`;
		if (node === void 0) return;
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
			const sortedValues = Array.from(node.values()).sort((a, b) => String(a).localeCompare(String(b)));
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
	refs: /* @__PURE__ */ new Map(),
	running: false,
	close: () => {},
	get: async () => {
		throw new Error("Called get on empty Resource ref");
	},
	untilRetain: Promise.resolve(),
	retain: async () => {}
};
var Resource = class {
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
	prepareInstance(ctx) {
		const key = stableStringify(ctx);
		if (this.instances.get(key)) return this.instances.get(key);
		let running = true;
		let close;
		let until;
		const untilRetain = new Promise((resolve) => until = resolve);
		const retain = () => {
			until();
			return new Promise((resolve) => {
				close = () => {
					this.instances.delete(key);
					if (running) resolve();
					running = false;
				};
			});
		};
		const refs = /* @__PURE__ */ new Map();
		const { emit, get } = createWaitable({
			equality: this.config?.equality,
			shouldAccept: () => running,
			afterEmit: (next, prev) => refs.forEach((ref) => ref.notify(next, prev))
		});
		Promise.resolve(this.init({
			emit,
			retain
		}, ctx)).then(until);
		const instance = {
			refs,
			running,
			close,
			get,
			untilRetain,
			retain
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
			await newInstance.untilRetain;
			newInstance.refs.set(ref, refEntry);
			instance.refs.delete(ref);
			instance.close();
			instance = newInstance;
		};
		return {
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
			}
		};
	}
};

//#endregion
//#region src/index.ts
const test = new Resource(async ({ retain }, num$1) => {
	console.log("H " + num$1);
	await retain();
	console.log("B " + num$1);
}).use(-1);
let num = 0;
setInterval(() => test.reuse(num++), 2e3);

//#endregion
export { Resource };
//# sourceMappingURL=index.js.map