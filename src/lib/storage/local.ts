import type { StorageLayer } from "@/lib/types";

const PREFIX = "askew:";

export class LocalStorage implements StorageLayer {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(PREFIX + key);
  }

  async list(prefix?: string): Promise<string[]> {
    const fullPrefix = PREFIX + (prefix ?? "");
    const results: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        results.push(k.slice(PREFIX.length));
      }
    }
    return results;
  }
}
