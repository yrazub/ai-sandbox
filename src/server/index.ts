import { buildApp } from './app';
import { OpenRouterProvider } from './adapters/openrouter/openrouter-provider';
import { HOST, loadConfig } from './platform/config';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env is fine: the server boots and a run reports the missing key.
}

const config = loadConfig(process.env);
const provider = new OpenRouterProvider({ getApiKey: () => config.openRouterApiKey });
const app = buildApp({ provider, logger: true });

app.listen({ host: HOST, port: config.port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
