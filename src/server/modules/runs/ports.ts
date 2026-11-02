/** A model as the provider reports it. Prices are USD per token, as OpenRouter sends them. */
export interface ProviderModel {
  id: string;
  name: string;
  /** Unix seconds. */
  created: number;
  promptUsdPerToken: number;
  completionUsdPerToken: number;
}

export interface CompletionRequest {
  modelId: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
}

export interface Completion {
  output: string;
  inputTokens: number;
  outputTokens: number;
  /** null when the provider did not report a cost. */
  costUsd: number | null;
}

export interface LlmProvider {
  listModels(): Promise<ProviderModel[]>;
  complete(request: CompletionRequest): Promise<Completion>;
}
