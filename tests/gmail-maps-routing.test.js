import test from 'node:test';
import assert from 'node:assert/strict';
import { routeGmailMapsCommand } from '../services/gmail-maps-commands.js';
process.env.GROQ_API_KEY ||= 'offline-test-placeholder';
const { routeVoiceCommand } = await import('../services/voice-agent.service.js');

test('Gmail/Maps screenshot commands bypass a model even with contradictory history', async () => {
  const client = { chat: { completions: { create: async () => { throw new Error('Must not call model for explicit phone commands'); } } } };
  for (const [text, tool, args] of [
    ['Read last email from JetGPT.', 'read_gmail', { limit: 1, unread_only: false, sender: 'JetGPT' }],
    ['Show me 1 last unread email.', 'read_gmail', { limit: 1, unread_only: true }],
    ['How much is Punerco from my current location?', 'get_driving_route', { destination: 'Punerco' }],
    ['Read five emails from Yash', 'read_gmail', { limit: 5, unread_only: true, sender: 'Yash' }],
    ['Read last email from Five Guys', 'read_gmail', { limit: 1, unread_only: false, sender: 'Five Guys' }],
    ['Read the latest unread Gmail message', 'read_gmail', { limit: 1, unread_only: true }],
    ['Read my already-read emails', 'read_gmail', { limit: 5, unread_only: false }],
    ['Do I have unread Gmail?', 'check_gmail', {}],
    ['Repeat those emails', 'read_gmail', { repeat_last: true }],
    ['Navigate to Pune from my current location', 'get_driving_route', { destination: 'Pune', start_navigation: true }],
    ['Take me to Phoenix Marketcity, Kurla', 'get_driving_route', { destination: 'Phoenix Marketcity, Kurla', start_navigation: true }],
    ['Open driving directions to Mumbai airport', 'get_driving_route', { destination: 'Mumbai airport' }],
    ['How far is Mumbai airport by car?', 'get_driving_route', { destination: 'Mumbai airport' }],
    ['How long will it take to drive to Phoenix Marketcity, Kurla?', 'get_driving_route', { destination: 'Phoenix Marketcity, Kurla' }],
    ['Read the current Maps route', 'get_driving_route', { read_current: true }],
    ['The second route', 'get_driving_route', { read_current: true, choice: 2 }],
  ]) {
    assert.deepEqual(await routeVoiceCommand({ text, history: [{ role: 'assistant', content: 'I cannot read mail or access location.' }] }, client), { success: true, type: 'tool_call', tool, arguments: args }, text);
  }
});
test('Unrelated questions and negation do not trigger Gmail or Maps actions', () => {
  for (const text of ['How much is an iPhone?', 'Read Gmail documentation', 'Do not read my emails', 'How far is the Moon from Earth?', 'How does Gmail work?', 'Send an email to Yash', 'Open WhatsApp', 'Explain what navigate to Pune means', 'Read WhatsApp messages', 'Original request:\nRead my emails']) {
    assert.equal(routeGmailMapsCommand(text), null, text);
  }
});
