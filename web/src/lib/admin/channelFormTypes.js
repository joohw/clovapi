/**
 * Options for channel type Select in simplified admin dialogs (add/edit).
 * IDs mirror `constant/channel.go`.
 */
export const CHANNEL_TYPE_OPTIONS = [
  { v: 1, label: 'OpenAI' },
  { v: 24, label: 'Gemini' },
  { v: 41, label: 'VertexAI' },
  { v: 14, label: 'Anthropic (Claude)' },
  { v: 43, label: 'DeepSeek' },
  { v: 56, label: 'Replicate' },
  { v: 38, label: 'Jina' },
  { v: 58, label: 'Tavily' },
  { v: 59, label: 'Brave' },
  { v: 33, label: 'AWS Bedrock' },
  { v: 40, label: 'SiliconFlow' },
  { v: 4, label: 'Ollama' },
  { v: 20, label: 'OpenRouter' },
  { v: 27, label: 'Perplexity' },
  { v: 8, label: 'Custom' },
  { v: 3, label: 'Azure OpenAI' },
];

/** Status values: `common/constants.go` ChannelStatus* */
export const CHANNEL_STATUS_OPTIONS = [
  { v: 1, label: '启用' },
  { v: 2, label: '已禁用（手动）' },
  { v: 3, label: '已禁用（自动）' },
];
