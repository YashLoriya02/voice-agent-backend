import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSpeechText, voiceReply } from '../services/speech-text.js';

process.env.GROQ_API_KEY ||= 'offline-test-placeholder';
const { routeVoiceCommand } = await import('../services/voice-agent.service.js');
const clientFor = (name, args) => ({ chat: { completions: { create: async () => ({
    choices: [{ message: { tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] } }],
}) } } });

test('plain speech keeps content but skips markdown and emoji sequences', () => {
    assert.equal(cleanSpeechText('## Lunch\n**Try** *rice* 🍽️ 🛍️ 🫂\n- [Details](https://example.com)'), 'Lunch Try rice Details');
    assert.equal(cleanSpeechText('👩🏽‍💻 🇮🇳 👨‍👩‍👧‍👦'), '');
    assert.equal(cleanSpeechText('₹250, 50%, 25°C. 2 * 3 * 4 = 24. 3 < 5. Café मुंबई नमस्ते.'), '₹250, 50%, 25°C. 2 times 3 times 4 = 24. 3 < 5. Café मुंबई नमस्ते.');
});
test('ordinary answers and questions are plain text before display and TTS', async () => {
    for (const name of ['answer_user', 'ask_user', 'unsupported']) {
        const result = await routeVoiceCommand({ text: 'Test command' }, clientFor(name, { message: '**Hello** 🫂' }));
        assert.equal(result.message, 'Hello');
    }
});
test('device tool arguments preserve outgoing message text exactly', async () => {
    const args = { name: 'Papa', channel: 'whatsapp', message: '**Hello** 🫂' };
    const result = await routeVoiceCommand({ text: 'Test command' }, clientFor('send_message', args));
    assert.deepEqual(result.arguments, args);
});
test('long answers prefer a complete sentence within the spoken word budget', () => {
    const sentence = 'This is a complete useful sentence.';
    const reply = voiceReply(Array(30).fill(sentence).join(' '));
    assert.ok(reply.split(/\s+/).length <= 90);
    assert.ok(reply.endsWith('.'));
});
