import Fastify, { type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { createModelCatalog } from './modules/runs/model-catalog';
import type { LlmProvider } from './modules/runs/ports';
import { registerRunRoutes } from './modules/runs/routes';
import { createRunService } from './modules/runs/service';
import { AppError } from './platform/errors';

interface Dependencies {
  provider: LlmProvider;
  logger?: boolean;
  now?: () => number;
  timeoutMs?: number;
  catalogTtlMs?: number;
}

/** Composition root: builds Fastify and wires the run module to its provider. */
export function buildApp({
  provider,
  logger = false,
  now,
  timeoutMs,
  catalogTtlMs,
}: Dependencies): FastifyInstance {
  const app = Fastify({ logger });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const first = error.validation[0];
      const where = first?.instancePath ? ` (${first.instancePath.slice(1)})` : '';
      return reply.status(400).send({ error: `Invalid request${where}: ${first?.message ?? ''}`.trim() });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.status(status).send({ error: 'Invalid request' });
    }
    app.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  });

  const catalog = createModelCatalog({ provider, now, ttlMs: catalogTtlMs });
  const service = createRunService({ provider, catalog, now, timeoutMs });
  registerRunRoutes(app, service);

  return app;
}
