import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GROQ_API_KEY ||= 'offline-test-placeholder';
const { routeVoiceCommand } = await import('../services/voice-agent.service.js');

test('notification tools are registered and returned for local execution', async () => {
  for (const [text, tool, args] of [
    ['Read my WhatsApp messages', 'read_messages', { channel: 'whatsapp' }],
    ['Read SMS from Papa', 'read_messages', { channel: 'messages', sender: 'Papa', limit: 5 }],
    ['Any new messages?', 'check_messages', { channel: 'all' }],
    ['Repeat those messages', 'read_messages', { unread_only: false, read_all: true }],
    ['Read all unread messages', 'read_messages', { unread_only: true, read_all: true }],
  ]) {
    const client = { chat: { completions: { create: async request => {
      const names = request.tools.map(item => item.function.name);
      assert.ok(names.includes('read_messages'));
      assert.ok(names.includes('check_messages'));
      const definition = request.tools.find(item => item.function.name === tool).function;
      assert.deepEqual(definition.parameters.properties.channel.enum, ['all', 'whatsapp', 'messages']);
      assert.equal(definition.parameters.properties.limit.maximum, 10);
      assert.equal(definition.parameters.properties.read_all.type, 'boolean');
      return { choices: [{ message: { tool_calls: [{ function: {
        name: tool, arguments: JSON.stringify(args),
      } }] } }] };
    } } } };
    assert.deepEqual(await routeVoiceCommand({ text }, client), {
      success: true, type: 'tool_call', tool, arguments: args,
    });
  }
});
