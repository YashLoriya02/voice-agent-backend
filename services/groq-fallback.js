import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

export const DEFAULT_GROQ_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];
export function configuredGroqModels() {
    const value = process.env.GROQ_MODELS;
    const models = value === undefined ? DEFAULT_GROQ_MODELS : value.split(',').map(s => s.trim()).filter(Boolean);
    if (!models.length || models.length > 5) throw new Error('GROQ_MODELS must contain 1 to 5 model IDs');
    return [...new Set(models)];
}

// Missing credentials are reported when a request is made, so health checks
// and offline tests do not require a real key.
export const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY || 'not-configured', maxRetries: 0 });
const cooldowns = new Map();
const header = (headers, name) => headers?.get?.(name) ?? headers?.[name] ?? null;
const quotaHeaders = ['x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens',
    'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens',
    'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens', 'retry-after'];
export function rateLimitHeaders(headers) {
    return Object.fromEntries(quotaHeaders.map(name => [name, header(headers, name)]));
}

export class GroqUnavailableError extends Error {
    constructor(attempts) {
        const limited = attempts.length > 0 && attempts.every(a => a.rateLimited);
        super(limited ? 'All available Groq models are rate limited.' : 'No configured Groq model could complete the request.');
        this.name = 'GroqUnavailableError';
        this.status = limited ? 429 : 503;
        this.code = limited ? 'GROQ_RATE_LIMITED' : 'GROQ_UNAVAILABLE';
        this.attempts = attempts;
        this.retryAfter = attempts.length ? Math.max(1, Math.min(...attempts.map(a => a.retryAfterSeconds ?? 30))) : 30;
    }
}

function failure(error, model) {
    const status = Number(error?.status) || 503;
    const code = error?.error?.code ?? error?.code ?? '';
    const rateLimited = status === 429 || code === 'rate_limit_exceeded';
    const limits = rateLimitHeaders(error?.headers);
    return { model, status, rateLimited, limits,
        // Provider error messages may contain organization IDs or request text.
        error: rateLimited ? 'Rate limit reached.' : `Groq request failed (${status}).` };
}
function mayFallback(error) {
    const status = Number(error?.status);
    const code = error?.error?.code ?? error?.code;
    return status === 429 || status === 408 || status === 404 || status >= 500 ||
        ['rate_limit_exceeded', 'model_decommissioned', 'model_not_found', 'model_permission_blocked'].includes(code) ||
        ['APIConnectionError', 'APIConnectionTimeoutError'].includes(error?.name);
}
function durationSeconds(value) {
    if (!value) return null;
    if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
    const units = { ms: .001, s: 1, m: 60, h: 3600, d: 86400 };
    const pieces = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)];
    return pieces.length ? pieces.reduce((sum, m) => sum + Number(m[1]) * units[m[2]], 0) : null;
}
function retryDelay(limits, now) {
    const retry = durationSeconds(limits['retry-after']) ??
        (limits['retry-after'] ? (Date.parse(limits['retry-after']) - now) / 1000 : null);
    const reset = limits['x-ratelimit-remaining-requests'] === '0'
        ? durationSeconds(limits['x-ratelimit-reset-requests'])
        : durationSeconds(limits['x-ratelimit-reset-tokens']);
    return Math.max(1, Math.min(86400, Math.ceil(Number.isFinite(retry) ? retry : reset ?? 30)));
}

/** One bounded attempt per model; no SDK sleeps/retries before trying fallback. */
export async function completeWithFallback(request, {
    client = groqClient, models = configuredGroqModels(), simulatePrimaryLimit = false,
    ignoreCooldown = false, cooldownStore = cooldowns, now = Date.now,
    budgetMs = 16500,
} = {}) {
    const attempts = [];
    const deadline = Date.now() + budgetMs;
    const signal = AbortSignal.timeout(budgetMs);
    for (let index = 0; index < models.length; index++) {
        const model = models[index];
        if (simulatePrimaryLimit && index === 0) {
            attempts.push({ model, status: 'simulated_rate_limit', simulated: true, rateLimited: true });
            continue;
        }
        const until = cooldownStore.get(model) ?? 0;
        if (!ignoreCooldown && until > now()) {
            attempts.push({ model, status: 'cooldown', rateLimited: true, retryAfterSeconds: Math.ceil((until - now()) / 1000) });
            continue;
        }
        if (Date.now() >= deadline) break;
        try {
            const modelRequest = { ...request, model };
            if (model.startsWith('qwen/')) {
                modelRequest.reasoning_effort = 'none';
            } else if (['openai/gpt-oss-20b', 'openai/gpt-oss-120b'].includes(model)) {
                modelRequest.reasoning_effort ??= 'low';
            }
            const pending = client.chat.completions.create(modelRequest, {
                maxRetries: 0, timeout: Math.min(5500, deadline - Date.now()), signal,
            });
            const { data, response } = typeof pending.withResponse === 'function'
                ? await pending.withResponse() : { data: await pending, response: null };
            cooldownStore.delete(model);
            attempts.push({ model, status: 200, rateLimited: false, limits: rateLimitHeaders(response?.headers) });
            return { data, model, attempts, limits: rateLimitHeaders(response?.headers) };
        } catch (error) {
            const attempt = failure(error, model);
            if (attempt.rateLimited) {
                attempt.retryAfterSeconds = retryDelay(attempt.limits, now());
                cooldownStore.set(model, now() + attempt.retryAfterSeconds * 1000);
            }
            attempts.push(attempt);
            // A shared invalid API key or malformed request cannot be repaired
            // by spending more calls on other models.
            if (!mayFallback(error)) throw new GroqUnavailableError(attempts);
        }
    }
    throw new GroqUnavailableError(attempts);
}

// Built-in browser_search belongs to GPT-OSS. A fallback must never turn a
// requested live search into an unsupported or invented answer.
export function browserSearchModels() {
    return configuredGroqModels().filter(model => ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'].includes(model));
}
