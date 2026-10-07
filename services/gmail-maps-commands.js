// Explicit personal Gmail/Maps commands bypass conversational history/model.
// Other intents continue through the existing router.
export function routeGmailMapsCommand(command) {
  if (typeof command !== 'string') return null;
  const text = command.trim().replace(/[.!?]+$/, '').trim();
  if (text.includes('\n')) return null;
  const lower = text.toLowerCase();
  const tool = (name, args) => ({ success: true, type: 'tool_call', tool: name, arguments: args });
  const mail = /^(?:please\s+)?(?:read|show(?:\s+me)?|tell(?:\s+me)?|check|repeat|replay|reread|do\s+i\s+have|are\s+there|any|how\s+many)\s+(?:(?:my|the|me|one|two|three|four|five|six|seven|eight|nine|ten|\d+|last|latest|newest|most\s+recent|recent|unread|unseen|new|already[ -]read|previously\s+read|read|old|all|every|previous|those|these)\s+)*(?:e-?mails?|gmail(?:\s+(?:e-?mails?|messages?))?|inbox)(?:\s+from\s+(.+?)|\s+again)?$/i.exec(text);
  if (mail) {
    const sender = mail[1]?.trim();
    if (!sender && /^(?:please\s+)?(?:check|do\s+i\s+have|are\s+there|any|how\s+many)\b/.test(lower)) return tool('check_gmail', {});
    if (!sender && /\b(repeat|replay|reread)\b|\bagain$/.test(lower)) return tool('read_gmail', { repeat_last: true });
    const numbers = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const request = lower.split(/\s+from\s+/)[0];
    const number = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/.exec(request)?.[1];
    const latest = /\b(last|latest|newest|most\s+recent)\b/.test(request);
    const unread = /\b(unread|unseen|new)\b/.test(request);
    const includeRead = latest || /\b(already[ -]read|previously\s+read|old|all|every)\b/.test(request);
    return tool('read_gmail', { limit: number ? (numbers[number] ?? Number(number)) : (latest ? 1 : 5), unread_only: unread || !includeRead, ...(sender ? { sender } : {}) });
  }
  if (/^(?:please\s+)?read\s+(?:the\s+)?(?:current|displayed)\s+(?:google\s+)?maps\s+route$/i.test(text)) return tool('get_driving_route', { read_current: true });
  const choice = /^(?:(?:read|choose|select)\s+)?(?:the\s+)?(first|second|third|[123])\s+route$/i.exec(text);
  if (choice) return tool('get_driving_route', { read_current: true, choice: ({ first: 1, second: 2, third: 3 })[choice[1].toLowerCase()] ?? Number(choice[1]) });
  const navigation = /^(?:please\s+)?(?:navigate(?:\s+me)?\s+to|start\s+(?:driving\s+)?navigation\s+to|take\s+me\s+to|drive\s+to|open\s+(?:google\s+)?maps\s+and\s+navigate\s+to)\s+(.+)$/i.exec(text);
  const directions = /^(?:please\s+)?(?:get|give(?:\s+me)?|show(?:\s+me)?|open)\s+(?:driving\s+)?directions\s+to\s+(.+)$/i.exec(text);
  const distance = /^how\s+(?:far|much|distant)\s+(?:is|are)\s+(.+)$/i.exec(text);
  if (/^how\s+much\b/i.test(text) && !/\bfrom\s+(?:(?:my|the)\s+)?(?:current\s+)?(?:location|here)\b|\bby\s+(?:car|road)\b/i.test(text)) return null;
  const duration = /^how\s+long\s+(?:(?:will|would|does)\s+it\s+take\s+(?:me\s+)?to\s+|to\s+)(?:drive|get|travel)\s+to\s+(.+)$/i.exec(text);
  const match = navigation ?? directions ?? distance ?? duration;
  if (!match) return null;
  const destination = match[1].trim().replace(/\s+from\s+(?:(?:my|the)\s+)?(?:current\s+)?(?:location|here)(?:\s+by\s+car)?$/i, '').replace(/\s+(?:by\s+car|driving|by\s+road)$/i, '').trim();
  if (!destination || /\s+from\s+/i.test(destination)) return null;
  return tool('get_driving_route', { destination, ...(navigation ? { start_navigation: true } : {}) });
}
