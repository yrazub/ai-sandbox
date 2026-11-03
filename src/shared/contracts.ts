import { z } from 'zod';

/** Limits the server enforces and the page mirrors. */
export const MAX_PROMPT_CHARS = 20_000;
export const MAX_MODELS_PER_RUN = 6;
/** A model above this output price is marked as expensive. */
export const EXPENSIVE_OUTPUT_USD_PER_MTOK = 30;

export const ModelInfo = z.object({
  id: z.string(),
  label: z.string(),
  inputUsdPerMTok: z.number(),
  outputUsdPerMTok: z.number(),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

export const ModelsResponse = z.object({ models: z.array(ModelInfo) });
export type ModelsResponse = z.infer<typeof ModelsResponse>;

export const RunRequest = z.object({
  prompt: z
    .string()
    .max(MAX_PROMPT_CHARS)
    .refine((prompt) => prompt.trim().length > 0, 'prompt must not be blank'),
  modelIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_MODELS_PER_RUN)
    .refine((ids) => new Set(ids).size === ids.length, 'modelIds must be unique'),
});
export type RunRequest = z.infer<typeof RunRequest>;

export const RunResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    modelId: z.string(),
    output: z.string(),
    latencyMs: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number().nullable(),
  }),
  z.object({
    status: z.literal('error'),
    modelId: z.string(),
    error: z.string(),
    latencyMs: z.number(),
  }),
]);
export type RunResult = z.infer<typeof RunResult>;

export const RunResponse = z.object({ results: z.array(RunResult) });
export type RunResponse = z.infer<typeof RunResponse>;

export const ErrorResponse = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const UsageResponse = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    okCalls: z.number().int().nonnegative(),
    unpricedCalls: z.number().int().nonnegative(),
    startedAt: z.iso.datetime(),
  })
  .refine((u) => u.unpricedCalls <= u.okCalls, {
    message: 'unpricedCalls must not exceed okCalls',
    path: ['unpricedCalls'],
  });
export type UsageResponse = z.infer<typeof UsageResponse>;
