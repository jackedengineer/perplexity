import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { parseSafetyModel } from '@/server/ai/models';

// Diagnostic overrides never modify production or the ignored deployment file.
// Both selectors are explicit; transport privacy/price/deadline caps still apply.
export async function safetyRouteConfig() {
  const env = parse(await readFile('.env.launch.local', 'utf8'));
  const model = process.env.LIVE_SAFETY_MODEL, provider = process.env.LIVE_SAFETY_PROVIDER;
  if (Boolean(model) !== Boolean(provider)) throw Error('Both route selectors are required');
  const config = parseSafetyModel(model ? { ...env, MODEL_SAFETY: model, SAFETY_OPENROUTER_PROVIDER: provider } : env);
  if (!config) throw Error('Configured safety route required');
  return config;
}
