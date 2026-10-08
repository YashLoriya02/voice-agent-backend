import express from 'express';
import { completeWithFallback, configuredGroqModels, groqClient, GroqUnavailableError } from '../services/groq-fallback.js';
import { cleanSpeechText } from '../services/speech-text.js';

export function createGroqTestRouter(client = groqClient) {
    const router = express.Router();
    router.post('/groq/test', async (req, res) => {
        const body = req.body ?? {};
        let configured;
        try { configured = configuredGroqModels(); }
        catch (_) { return res.status(500).json({ success: false, error: 'GROQ_MODELS configuration is invalid.' }); }
        if (typeof body !== 'object' || Array.isArray(body) ||
            ['error', 'all', 'fallback'].some(key => key in body && typeof body[key] !== 'boolean') ||
            (body.text !== undefined && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000))) {
            return res.status(400).json({ success: false, error: 'error, all and fallback must be booleans; text must be a nonempty string up to 2000 characters.' });
        }
        const aliases = { '20b': 'openai/gpt-oss-20b', '120b': 'openai/gpt-oss-120b', 'third': configured[2] };
        const selected = body.model === undefined ? null : aliases[body.model] ?? body.model;
        if (selected !== null && !configured.includes(selected)) {
            return res.status(400).json({ success: false, error: 'model must be one of the configured Groq model IDs or 20b, 120b, third.', models: configured });
        }
        if ((body.all && (selected || body.error)) || (body.error && (selected || body.fallback === false))) {
            return res.status(400).json({ success: false, error: 'Use all, a specific model, or error simulation separately.' });
        }
        if (client === groqClient && !process.env.GROQ_API_KEY) {
            return res.status(503).json({ success: false, error: 'GROQ_API_KEY is missing.' });
        }
        res.set('Cache-Control', 'no-store');
        const probe = async (models, simulate = false) => {
            try {
                const result = await completeWithFallback({
                    messages: [{ role: 'system', content: 'Reply briefly in plain text. Do not use markdown or emojis.' },
                        { role: 'user', content: body.text?.trim() ?? 'Say API is working.' }],
                    temperature: 0, max_completion_tokens: 1024, reasoning_effort: 'low',
                }, { client, models, simulatePrimaryLimit: simulate, ignoreCooldown: true });
                return { success: true, model: result.model,
                    message: `API is working via ${result.model} model.`,
                    response: cleanSpeechText(result.data.choices?.[0]?.message?.content),
                    limits: result.limits, attempts: result.attempts };
            } catch (error) {
                if (!(error instanceof GroqUnavailableError)) throw error;
                return { success: false, error: error.message, code: error.code,
                    status: error.status, retryAfterSeconds: error.retryAfter, attempts: error.attempts };
            }
        };
        try {
            if (body.all) {
                const results = await Promise.all(configured.map(model => probe([model])));
                const success = results.some(result => result.success);
                const status = success ? 200 : results.every(result => result.status === 429) ? 429 : 503;
                return res.status(status).json({ success, allModelsWorking: results.every(result => result.success), results });
            }
            const models = selected ? (body.fallback === true ? [selected, ...configured.filter(m => m !== selected)] : [selected]) : body.fallback === false ? configured.slice(0, 1) : configured;
            const result = await probe(models, body.error === true);
            if (!result.success && result.status === 429) res.set('Retry-After', String(result.retryAfterSeconds));
            return res.status(result.success ? 200 : result.status).json(result);
        } catch (_) {
            return res.status(500).json({ success: false, error: 'Unable to test Groq.' });
        }
    });
    return router;
}
