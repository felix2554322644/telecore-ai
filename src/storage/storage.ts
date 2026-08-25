/**
 * Autonomous Telegram Channel Manager - Storage Abstraction Layer
 *
 * Supports $0/month free tier with zero external dependencies.
 * Automatically adapts between Cloudflare KV bindings and In-Memory storage.
 */

import { Env, IStorage, KVNamespace, StorageOptions } from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('Storage');

interface MemoryEntry<T> {
  value: T;
  expiresAt?: number;
}

/**
 * High-performance in-memory storage implementation for local dev and testing
 */
export class InMemoryStorageAdapter implements IStorage {
  private store = new Map<string, MemoryEntry<unknown>>();

  public async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  public async set<T = unknown>(key: string, value: T, options?: StorageOptions): Promise<void> {
    const entry: MemoryEntry<T> = {
      value,
      expiresAt: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined,
    };
    this.store.set(key, entry);
  }

  public async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  public async list(prefix?: string): Promise<string[]> {
    const now = Date.now();
    const keys: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (!prefix || key.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  }

  public clear(): void {
    this.store.clear();
  }
}

/**
 * Cloudflare Workers KV Storage Adapter
 */
export class CloudflareKVStorageAdapter implements IStorage {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  public async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const data = await this.kv.get(key, 'json');
      return data as T | null;
    } catch (err) {
      logger.error('kv_get_failed', `Failed to get KV key: ${key}`, { error: err });
      return null;
    }
  }

  public async set<T = unknown>(key: string, value: T, options?: StorageOptions): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const kvOptions: { expirationTtl?: number } = {};
      if (options?.expirationTtl) {
        kvOptions.expirationTtl = options.expirationTtl;
      }
      await this.kv.put(key, serialized, kvOptions);
    } catch (err) {
      logger.error('kv_set_failed', `Failed to set KV key: ${key}`, { error: err });
      throw err;
    }
  }

  public async delete(key: string): Promise<boolean> {
    try {
      await this.kv.delete(key);
      return true;
    } catch (err) {
      logger.error('kv_delete_failed', `Failed to delete KV key: ${key}`, { error: err });
      return false;
    }
  }

  public async list(prefix?: string): Promise<string[]> {
    try {
      const result = await this.kv.list({ prefix });
      return result.keys.map((k) => k.name);
    } catch (err) {
      logger.error('kv_list_failed', 'Failed to list KV keys', { error: err });
      return [];
    }
  }
}

/**
 * Storage factory with automatic adapter selection
 */
export function createStorage(env?: Partial<Env>): IStorage {
  if (env?.STORAGE_KV) {
    logger.info('storage_initialized', 'Using Cloudflare KV storage adapter');
    return new CloudflareKVStorageAdapter(env.STORAGE_KV);
  }

  return new InMemoryStorageAdapter();
}
