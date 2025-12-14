import { createHash } from "crypto";

class ReferenceRegistry {
  private refCount = 0;
  private refs = new WeakMap<object, string>();

  constructor(private allowPredicate: (obj: any) => boolean) {}

  getId(obj: any): string | undefined {
    if (!this.allowPredicate(obj)) return undefined;

    if (!this.refs.has(obj)) {
      this.refCount++;
      this.refs.set(obj, `__ref_${this.refCount}__`);
    }

    return this.refs.get(obj);
  }
}

const registry = new ReferenceRegistry((obj) => {
  return (
    typeof obj === "function" ||
    (obj && typeof obj === "object" && obj.constructor !== Object) ||
    typeof obj === "symbol"
  );
});

function stableStringify(data: any): string {
  const seen: any[] = [];

  function stringifyInternal(node: any): string | undefined {
    if (node && typeof node.toJSON === "function") {
      node = node.toJSON();
    }

    if (registry && node && typeof node === "object") {
      const refId = registry.getId(node);
      if (refId) return JSON.stringify(refId);
    }

    if (typeof node === "function") {
      const refId = registry.getId(node);
      if (refId) return JSON.stringify(refId);
      return undefined;
    }

    if (typeof node === "bigint") return `"${node.toString()}n"`;
    if (node === undefined) return undefined;

    if (typeof node !== "object" || node === null) {
      if (typeof node === "number" && !Number.isFinite(node)) return "null";
      return JSON.stringify(node);
    }

    if (Array.isArray(node)) {
      const out = node.map((v) => stringifyInternal(v) ?? "null").join(",");
      return `[${out}]`;
    }

    if (seen.includes(node)) return JSON.stringify("__cycle__");

    if (node instanceof Date) return `"${node.toISOString()}"`;
    if (node instanceof RegExp) return JSON.stringify(node.toString());

    if (node instanceof Map) {
      const sorted = Array.from(node.entries()).sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]))
      );
      const out = sorted
        .map(([k, v]) => `[${stringifyInternal(k)},${stringifyInternal(v)}]`)
        .join(",");
      return `[${out}]`;
    }

    if (node instanceof Set) {
      const sorted = Array.from(node.values()).sort((a, b) =>
        String(a).localeCompare(String(b))
      );
      const out = sorted.map((v) => stringifyInternal(v)).join(",");
      return `[${out}]`;
    }

    seen.push(node);
    const keys = Object.keys(node).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const val = stringifyInternal(node[key]);
      if (val !== undefined) parts.push(`${JSON.stringify(key)}:${val}`);
    }
    seen.pop();

    return `{${parts.join(",")}}`;
  }

  return stringifyInternal(data) || "null";
}

export function stableHash(data: any): string {
  const json = stableStringify(data);
  const hash = createHash("sha256").update(json).digest("hex");
  return hash;
}
