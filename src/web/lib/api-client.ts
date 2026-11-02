import type { z } from 'zod';
import {
  ErrorResponse,
  ModelsResponse,
  RunResponse,
  type RunRequest,
} from '../../shared/contracts';

async function call<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error('Could not reach the server');
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const failure = ErrorResponse.safeParse(body);
    throw new Error(failure.success ? failure.data.error : `Request failed (${response.status})`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error('Unexpected response from the server');
  return parsed.data;
}

export async function fetchModels() {
  return (await call('/api/models', ModelsResponse)).models;
}

export async function postRun(request: RunRequest) {
  const { results } = await call('/api/runs', RunResponse, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  return results;
}
