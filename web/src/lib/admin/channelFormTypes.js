/**
 * Options for channel type Select in simplified admin dialogs (add/edit).
 * IDs mirror `constant/channel.go`.
 */
import { CHANNEL_TYPE_LABEL } from '$lib/admin/channelLabels.js';

const CHANNEL_TYPE_LABEL_OVERRIDES = {
  3: 'Azure OpenAI',
  14: 'Anthropic (Claude)',
  33: 'AWS Bedrock',
};

export const CHANNEL_TYPE_OPTIONS = Object.entries(CHANNEL_TYPE_LABEL)
  .map(([k, label]) => {
    const v = Number(k);
    return { v, label: CHANNEL_TYPE_LABEL_OVERRIDES[v] ?? label };
  })
  .filter((item) => Number.isFinite(item.v) && item.v > 0)
  .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));

/** Status values: `common/constants.go` ChannelStatus* */
export const CHANNEL_STATUS_OPTIONS = [
  { v: 1, label: '启用' },
  { v: 2, label: '已禁用（手动）' },
  { v: 3, label: '已禁用（自动）' },
];
