import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { completeWithFallback, DEFAULT_GROQ_MODELS, GroqUnavailableError, browserSearchModels } from '../services/groq-fallback.js';
import { createGroqTestRouter } from '../routes/groq-check.js';
process.env.GROQ_API_KEY ||= 'offline-test-placeholder';
const { routeVoiceCommand } = await import('../services/voice-agent.service.js');

const quotaError = (seconds = '10') => Object.assign(new Error('private org details'), {
    status: 429, headers: new Headers({ 'retry-after': seconds, 'x-ratelimit-remaining-tokens': '0' }),
});
const response = { choices: [{ message: { content: 'API is working.', tool_calls: [{ function: {
    name: 'control_volume', arguments: '{"action":"set","percent":50}',
} }] } }] };
function mockClient(handler) {
    const calls = [];
    return { calls, chat: { completions: { create: (request, options) => {
        calls.push({ request, options });
        return { withResponse: async () => {
            const data = await handler(request, calls.length);
            return { data, response: { headers: new Headers({ 'x-ratelimit-remaining-requests': '99', 'x-ratelimit-remaining-tokens': '7000' }) } };
        } };
    } } } };
}
test('429 on 20B falls back to 120B immediately, with the same tools and no SDK retries', async () => {
    const client = mockClient((_, index) => { if (index === 1) throw quotaError(); return response; });
    const request = { messages: [{ role: 'user', content: 'Volume 50 percent' }], tools: [{ type: 'function' }], tool_choice: 'required' };
    const result = await completeWithFallback(request, { client, cooldownStore: new Map() });
    assert.equal(result.model, DEFAULT_GROQ_MODELS[1]);
    assert.deepEqual(client.calls.map(c => c.request.model), DEFAULT_GROQ_MODELS.slice(0, 2));
    assert.deepEqual(client.calls[1].request.tools, request.tools);
    assert.equal(client.calls[0].options.maxRetries, 0);
    assert.equal(result.limits['x-ratelimit-remaining-requests'], '99');
});
test('both GPT models exhausted uses the third tool-capable model', async () => {
    const client = mockClient((_, index) => { if (index < 3) throw quotaError(); return response; });
    const result = await completeWithFallback({}, { client, cooldownStore: new Map() });
    assert.equal(result.model, DEFAULT_GROQ_MODELS[2]);
});
test('all models limited returns 429 and a retry time, with sanitized error details', async () => {
    const client = mockClient(() => { throw quotaError('7'); });
    await assert.rejects(completeWithFallback({}, { client, cooldownStore: new Map() }), error => {
        assert.ok(error instanceof GroqUnavailableError);
        assert.equal(error.status, 429);
        assert.equal(error.retryAfter, 7);
        assert.equal(error.attempts.length, 3);
        assert.ok(!JSON.stringify(error.attempts).includes('private org details'));
        return true;
    });
});
test('rate-limited model is skipped until cooldown expires', async () => {
    const cooldownStore = new Map();
    let time = 1000;
    const client = mockClient(request => { if (request.model === DEFAULT_GROQ_MODELS[0]) throw quotaError('2'); return response; });
    await completeWithFallback({}, { client, cooldownStore, now: () => time });
    await completeWithFallback({}, { client, cooldownStore, now: () => time });
    assert.deepEqual(client.calls.map(c => c.request.model), [DEFAULT_GROQ_MODELS[0], DEFAULT_GROQ_MODELS[1], DEFAULT_GROQ_MODELS[1]]);
    time += 2100;
    await completeWithFallback({}, { client, cooldownStore, now: () => time });
    assert.equal(client.calls[3].request.model, DEFAULT_GROQ_MODELS[0]);
});
test('invalid API key does not retry unrelated models', async () => {
    const client = mockClient(() => { throw Object.assign(new Error('bad key'), { status: 401 }); });
    await assert.rejects(completeWithFallback({}, { client, cooldownStore: new Map() }));
    assert.equal(client.calls.length, 1);
});
test('browser search only uses models that support its built-in tool', () => {
    assert.deepEqual(browserSearchModels(), DEFAULT_GROQ_MODELS.slice(0, 2));
});
test('normal voice route hides model fallback and preserves the existing tool-call contract', async () => {
    const client = mockClient((_, index) => { if (index === 1) throw quotaError(); return response; });
    const result = await routeVoiceCommand({ text: 'Volume to 50 percent' }, client);
    assert.deepEqual(result, { success: true, type: 'tool_call', tool: 'control_volume', arguments: { action: 'set', percent: 50 } });
});

async function endpoint(client, body) {
    const app = express(); app.use(express.json()); app.use(createGroqTestRouter(client));
    const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/groq/test`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
    } finally { await new Promise(resolve => server.close(resolve)); }
}
test('test endpoint error:true simulates 20B failure without consuming a 20B call', async () => {
    const client = mockClient(() => response);
    const result = await endpoint(client, { error: true });
    assert.equal(result.status, 200);
    assert.equal(result.body.model, DEFAULT_GROQ_MODELS[1]);
    assert.equal(result.body.attempts[0].simulated, true);
    assert.match(result.body.message, /120b/);
    assert.deepEqual(client.calls.map(c => c.request.model), [DEFAULT_GROQ_MODELS[1]]);
});
test('an explicit model probe reports that model limit rather than hiding it through fallback', async () => {
    const client = mockClient(() => { throw quotaError(); });
    const result = await endpoint(client, { model: '120b' });
    assert.equal(result.status, 429);
    assert.equal(result.body.attempts.length, 1);
    assert.equal(result.body.attempts[0].model, DEFAULT_GROQ_MODELS[1]);
});
test('all:true checks every configured model with each real limit status', async () => {
    const client = mockClient(request => { if (request.model === DEFAULT_GROQ_MODELS[0]) throw quotaError(); return response; });
    const result = await endpoint(client, { all: true });
    assert.equal(result.status, 200);
    assert.equal(result.body.allModelsWorking, false);
    assert.equal(result.body.results.length, 3);
    assert.equal(result.body.results[0].success, false);
    assert.equal(result.body.results[1].limits['x-ratelimit-remaining-tokens'], '7000');
});
test('invalid test controls are rejected before making any model request', async () => {
    const client = mockClient(() => response);
    const result = await endpoint(client, { error: 'true' });
    assert.equal(result.status, 400);
    assert.equal(client.calls.length, 0);
});
