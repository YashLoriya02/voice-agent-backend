const messageQueryParameters = {
  type: 'object',
  properties: {
    channel: { type: 'string', enum: ['all', 'whatsapp', 'messages'] },
    sender: { type: 'string', description: 'Sender or conversation name requested by the user.' },
    limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Maximum previews to read, default 5.' },
    unread_only: { type: 'boolean', description: 'True by default: previews not yet spoken by the assistant. False to repeat available previews.' },
  },
  required: [], additionalProperties: false,
};

// Native actions shared by both providers use the same names and arguments.
export const deviceTools = [
  {
    name: 'read_messages',
    description: 'Read captured WhatsApp or SMS/RCS notification previews aloud ON THE PHONE with on-device speech. Contents never appear in the remote function response. Defaults to all channels and previews not yet spoken. Set unread_only=false to repeat available previews. These are notification previews, not a complete unread inbox.',
    parameters: messageQueryParameters,
  },
  {
    name: 'check_messages',
    description: 'Report new WhatsApp or SMS/RCS notification preview counts and senders ON THE PHONE with on-device speech, without reading bodies or marking them spoken. The function response contains only completion status. Defaults to all channels and previews not yet spoken.',
    parameters: messageQueryParameters,
  },
  {
    name: 'sleep_agent',
    description: 'End the assistant session and close its app or sheet on Sleep, Exit, or a request to dismiss this assistant. Do not use for sleep advice or alarms.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'set_torch',
    description: 'Turn the phone torch or flashlight on or off.',
    parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'], additionalProperties: false },
  },
  {
    name: 'control_volume',
    description: 'Set, raise, lower, mute, or unmute volume. Default stream is media. percent is required for set; increase/decrease changes one system step.',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['set', 'increase', 'decrease', 'mute', 'unmute'] },
        stream: { type: 'string', enum: ['media', 'ring', 'alarm'] },
        percent: { type: 'integer', minimum: 0, maximum: 100 },
      },
      required: ['operation'], additionalProperties: false,
    },
  },
  {
    name: 'set_brightness',
    description: 'Set screen brightness from 0 (minimum) to 100 percent. Requires modify system settings access and switches to manual brightness.',
    parameters: { type: 'object', properties: { percent: { type: 'integer', minimum: 0, maximum: 100 } }, required: ['percent'], additionalProperties: false },
  },
  {
    name: 'get_battery',
    description: 'Read the actual battery percentage and charging state from the phone. Never guess the battery level.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
];
