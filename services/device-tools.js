// Native actions shared by both providers use the same names and arguments.
export const deviceTools = [
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
