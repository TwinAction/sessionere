import { Resource } from "../resource";

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

const registry = new ReferenceRegistry(
  (obj) => typeof obj === "function" || obj instanceof Resource
);

export function stableStringify(data: any): string {
  const seen: any[] = [];

  function stringifyInternal(node: any): string | undefined {
    if (node && typeof node.toJSON === "function") {
      node = node.toJSON();
    }

    if (registry && node && typeof node === "object") {
      const refId = registry.getId(node);
      if (refId) {
        return JSON.stringify(refId);
      }
    }

    if (typeof node === "function") {
      if (registry) {
        const refId = registry.getId(node);
        if (refId) return JSON.stringify(refId);
      }
      return undefined;
    }

    if (typeof node === "bigint") {
      return `"${node.toString()}n"`;
    }

    if (node === undefined) {
      return undefined;
    }

    if (typeof node !== "object" || node === null) {
      if (typeof node === "number" && !Number.isFinite(node)) {
        return "null";
      }
      return JSON.stringify(node);
    }

    if (Array.isArray(node)) {
      let out = "[";
      for (let i = 0; i < node.length; i++) {
        if (i > 0) out += ",";
        const value = stringifyInternal(node[i]);
        out += value === undefined ? "null" : value;
      }
      return out + "]";
    }

    if (seen.includes(node)) {
      return JSON.stringify("__cycle__");
    }

    if (node instanceof Date) {
      return `"${node.toISOString()}"`;
    }

    if (node instanceof RegExp) {
      return JSON.stringify(node.toString());
    }

    if (node instanceof Map) {
      const sortedEntries = Array.from(node.entries()).sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]))
      );
      let out = "[";
      for (let i = 0; i < sortedEntries.length; i++) {
        if (i > 0) out += ",";
        const [map_key, map_value] = sortedEntries[i];
        out += `[${stringifyInternal(map_key)},${stringifyInternal(map_value)}]`;
      }
      return out + "]";
    }

    if (node instanceof Set) {
      const sortedValues = Array.from(node.values()).sort((a, b) =>
        String(a).localeCompare(String(b))
      );
      let out = "[";
      for (let i = 0; i < sortedValues.length; i++) {
        if (i > 0) out += ",";
        out += stringifyInternal(sortedValues[i]);
      }
      return out + "]";
    }

    const seenIndex = seen.push(node) - 1;

    const keys = Object.keys(node).sort();
    let out = "";
    let first = true;
    for (const key of keys) {
      const value = stringifyInternal(node[key]);
      if (value === undefined) continue;
      if (!first) out += ",";
      first = false;
      out += JSON.stringify(key) + ":" + value;
    }

    seen.splice(seenIndex, 1);
    return "{" + out + "}";
  }

  return stringifyInternal(data) || "null";
}
