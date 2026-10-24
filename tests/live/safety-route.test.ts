import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { safetyRouteConfig } from './safety-route-config';
import { createOpenRouterSafetyProvider } from '@/server/safety/openrouter';
import { createInputGate } from '@/server/safety/input';
import { INPUT_SAFETY_PROMPT } from '@/server/safety/prompt';
import { EVIDENCE_SAFETY_PROMPT } from '@/server/safety/evidence';
import { OUTPUT_SAFETY_PROMPT } from '@/server/safety/output';
import { CURRENT_PROMPT_VERSIONS, loadCorpus } from '../../evals/report';

// Opt-in only. No automatic retries; unknown receipts retain their full claim.
it('checks every semantic safety fixture within the existing $1 key cap', async () => {
  if (process.env.LIVE_SAFETY_ROUTE !== '1') throw Error('Explicit paid opt-in required');
  const config = await safetyRouteConfig();
  const metadata = async () => {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok) throw Error('Key cap unavailable');
    const { data } = await response.json();
    if (data.limit !== 1 || data.limit_reset !== null || data.limit_remaining < .2) {
      throw Error('Existing non-resetting cap and headroom required');
    }
    return { usage: data.usage, remaining: data.limit_remaining };
  };
  const before = await metadata(), { safety, corpusHash } = await loadCorpus();
  const semantic = safety.filter(c => c.test === 'SEMANTIC');
  const observations: Array<Record<string, unknown>> = [];
  let calls = 0, booked = 0n;
  const request: typeof fetch = async (url, init) => {
    if (String(url) !== 'https://openrouter.ai/api/v1/chat/completions' ||
        ++calls > semantic.length || booked + 2250n > 200000n) {
      throw Error('Local evaluation envelope exhausted');
    }
    booked += 2250n;
    return fetch(url, init);
  };
  const directory = `.artifacts/safety-route/${randomUUID()}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  for (const fixture of semantic) {
    const prompt = fixture.stage === 'OUTPUT' ? OUTPUT_SAFETY_PROMPT :
      fixture.stage === 'EVIDENCE' ? EVIDENCE_SAFETY_PROMPT : INPUT_SAFETY_PROMPT;
    const provider = createOpenRouterSafetyProvider(config, request, prompt);
    const startedCalls = calls;
    const result = await createInputGate(provider).evaluate({
      text: fixture.text, context: fixture.context ?? [],
    }, { signal: AbortSignal.timeout(5000), deadlineAt: new Date(Date.now() + 5000) });
    const cost = provider.usage?.()?.costMicroUsd;
    if (calls > startedCalls && cost != null) booked += cost - 2250n;
    observations.push({ id: fixture.id, expected: fixture.expected,
      actual: result.verdict.decision, durationMs: result.durationMs,
      categories: result.verdict.decision === 'BLOCK' ? result.verdict.categoryCodes : [],
      categoryMatch: fixture.categories.every(code => result.verdict.decision === 'BLOCK' &&
        result.verdict.categoryCodes.includes(code)), costMicroUsd: cost?.toString() ?? null });
    await writeFile(`${directory}/observations.json`, JSON.stringify({ revision, corpusHash,
      promptVersions: CURRENT_PROMPT_VERSIONS, model: config.modelId, provider: config.provider,
      before, calls, bookedMicroUsd: String(booked), observations }, null, 2), { mode: 0o600 });
  }
  await writeFile(`${directory}/cap-after.json`, JSON.stringify(await metadata()), { mode: 0o600 });
  expect(observations).toHaveLength(72);
  for (const observation of observations) {
    expect({ decision: observation.actual, categories: observation.categoryMatch }, String(observation.id))
      .toEqual({ decision: observation.expected, categories: true });
  }
}, 300000);
