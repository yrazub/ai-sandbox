import { z } from 'zod';

export const HOST = '127.0.0.1';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  OPENROUTER_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((key) => key || undefined),
});

export interface Config {
  port: number;
  /** Absent is allowed: the server boots and a run reports the missing key. */
  openRouterApiKey: string | undefined;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = EnvSchema.parse(env);
  return { port: parsed.PORT, openRouterApiKey: parsed.OPENROUTER_API_KEY };
}
