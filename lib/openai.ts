import OpenAI from "@openai/openai";
import { EnvVars } from "lib/constants.ts";

/**
 * Configuration options for the OpenAI service
 */
export interface OpenAIConfig {
  /** API key for authentication with OpenAI */
  apiKey?: string;
  /** Optional organization identifier */
  organization?: string;
  /** Optional project identifier */
  project?: string;
}

/**
 * OpenAI service that manages connection and provides access to OpenAI API
 */
export class OpenAIService {
  private static instance: OpenAIService | null = null;
  private client: OpenAI | null = null;
  private readonly config: OpenAIConfig;

  /**
   * Creates an OpenAI service instance with the specified configuration
   * @param config Configuration options for the OpenAI service
   * @private
   */
  private constructor(config: OpenAIConfig = {}) {
    this.config = {
      apiKey: Deno.env.get(EnvVars.OPENAI.API_KEY) || config.apiKey,
      organization: Deno.env.get(EnvVars.OPENAI.ORGANIZATION) || config.organization,
      project: Deno.env.get(EnvVars.OPENAI.PROJECT) || config.project,
    };
  }

  /**
   * Gets the singleton instance of the OpenAI service
   * @param config Optional configuration to initialize the service with
   * @returns The OpenAI service instance
   */
  public static getInstance(config?: OpenAIConfig): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService(config);
    }
    return OpenAIService.instance;
  }

  /**
   * Initializes the OpenAI client
   * @throws Error if initialization fails due to missing API key
   */
  public initialize(): void {
    if (this.client) {
      return;
    }

    if (!this.config.apiKey) {
      throw new Error("Missing required OpenAI API key");
    }

    try {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        organization: this.config.organization,
        project: this.config.project,
      });
    } catch (error) {
      throw new Error(`Failed to initialize OpenAI client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets the OpenAI client instance, initializing if necessary
   * @returns The OpenAI client instance
   * @throws Error if initialization fails
   */
  public getClient(): OpenAI {
    if (!this.client) {
      this.initialize();
    }
    return this.client!;
  }

  /**
   * Checks if the OpenAI client is properly configured with an API key
   * @returns True if an API key is available
   */
  public isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Resets the client instance, forcing re-initialization on next use
   */
  public reset(): void {
    this.client = null;
  }
}

/**
 * Convenience shorthand for getting the default OpenAI service instance
 */
export const openAIService = OpenAIService.getInstance();
