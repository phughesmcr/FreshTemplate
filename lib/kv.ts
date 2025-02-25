/// <reference lib="deno.unstable" />

import { EnvVars } from "lib/constants.ts";

/**
 * KV Store configuration options
 */
export interface KvConfig {
  /** Optional admin key for privileged operations */
  adminKey?: string;
}

/**
 * KV Store service that manages connection and provides access to Deno's KV store
 */
export class KvService {
  private static instance: KvService | null = null;
  private kvInstance: Deno.Kv | null = null;
  private readonly config: KvConfig;

  /**
   * Creates a KV service instance with the specified configuration
   * @param config Configuration options for the KV service
   * @private
   */
  private constructor(config: KvConfig = {}) {
    this.config = {
      adminKey: Deno.env.get(EnvVars.KV.ADMIN_KEY) || config.adminKey,
    };
  }

  /**
   * Gets the singleton instance of the KV service
   * @param config Optional configuration to initialize the service with
   * @returns The KV service instance
   */
  public static getInstance(config?: KvConfig): KvService {
    if (!KvService.instance) {
      KvService.instance = new KvService(config);
    }
    return KvService.instance;
  }

  /**
   * Initializes and connects to the KV store
   * @throws Error if connection fails
   */
  public async connect(): Promise<void> {
    if (this.kvInstance) {
      return;
    }

    try {
      this.kvInstance = await Deno.openKv();
    } catch (error) {
      throw new Error(`Failed to connect to KV store: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets the KV store instance, connecting if necessary
   * @returns The KV store instance
   * @throws Error if connection fails
   */
  public async getKv(): Promise<Deno.Kv> {
    if (!this.kvInstance) {
      await this.connect();
    }
    return this.kvInstance!;
  }

  /**
   * Gets the admin key if available
   * @returns The admin key or null if not set
   */
  public getAdminKey(): string | null {
    return this.config.adminKey || null;
  }

  /**
   * Checks if the provided key matches the admin key
   * @param key The key to validate
   * @returns True if the key is valid, false otherwise
   */
  public isValidAdminKey(key: string): boolean {
    return !!this.config.adminKey && key === this.config.adminKey;
  }

  /**
   * Closes the KV store connection
   */
  public close(): void {
    if (this.kvInstance) {
      this.kvInstance.close();
      this.kvInstance = null;
    }
  }
}

/**
 * Convenience shorthand for getting the default KV service instance
 */
export const kvService = KvService.getInstance();

/**
 * Helper function to get the KV store instance
 * @returns Promise resolving to the KV store instance
 */
export async function getKv(): Promise<Deno.Kv> {
  return await kvService.getKv();
}
