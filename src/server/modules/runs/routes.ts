import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponse,
  ModelsResponse,
  RunRequest,
  RunResponse,
  UsageResponse,
} from '../../../shared/contracts';
import type { RunService } from './service';

export function registerRunRoutes(app: FastifyInstance, service: RunService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/models',
    { schema: { response: { 200: ModelsResponse, 503: ErrorResponse } } },
    async () => ({ models: await service.models() }),
  );

  typed.post(
    '/api/runs',
    {
      schema: {
        body: RunRequest,
        response: { 200: RunResponse, 400: ErrorResponse, 503: ErrorResponse },
      },
    },
    async (request) => service.run(request.body),
  );

  typed.get(
    '/api/usage',
    { schema: { response: { 200: UsageResponse } } },
    async (_request, reply) => {
      reply.header('cache-control', 'no-store');
      return service.usage();
    },
  );
}
