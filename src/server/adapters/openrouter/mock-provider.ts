import type {
  Completion,
  CompletionRequest,
  LlmProvider,
  ProviderModel,
} from '../../modules/runs/ports';

const DEFAULT_MODELS: ProviderModel[] = [
  { id: 'mock/fast', name: 'Mock: Fast', created: 3, promptUsdPerToken: 1e-7, completionUsdPerToken: 2e-7 },
  { id: 'mock/smart', name: 'Mock: Smart', created: 2, promptUsdPerToken: 5e-6, completionUsdPerToken: 2.5e-5 },
  { id: 'mock/pricey', name: 'Mock: Pricey', created: 1, promptUsdPerToken: 1.5e-5, completionUsdPerToken: 7.5e-5 },
];

interface Options {
  models?: ProviderModel[];
  /** Decides what each call returns. Throw to simulate a failing model. */
  respond?: (request: CompletionRequest) => Completion | Promise<Completion>;
  listError?: Error;
}

/** Test double for LlmProvider. It never touches the network. */
export class MockProvider implements LlmProvider {
  readonly calls: CompletionRequest[] = [];
  listCalls = 0;
  private readonly models: ProviderModel[];
  private readonly respond: NonNullable<Options['respond']>;
  private listError: Error | undefined;

  constructor({ models = DEFAULT_MODELS, respond, listError }: Options = {}) {
    this.models = models;
    this.listError = listError;
    this.respond =
      respond ??
      (({ modelId, prompt }) => ({
        output: `[${modelId}] ${prompt}`,
        inputTokens: 10,
        outputTokens: 20,
        costUsd: 0.0001,
      }));
  }

  failListing(error: Error | undefined): void {
    this.listError = error;
  }

  async listModels(): Promise<ProviderModel[]> {
    this.listCalls += 1;
    if (this.listError) throw this.listError;
    return this.models;
  }

  async complete(request: CompletionRequest): Promise<Completion> {
    this.calls.push(request);
    return this.respond(request);
  }
}
