import React from 'react';
import { Tag } from '@douyinfe/semi-ui';
import { renderModelTag } from '../../../../../helpers';

const renderYesNoTag = (value) => (
  <Tag color={value ? 'green' : 'grey'} shape='circle' size='small'>
    {value ? 'YES' : 'NO'}
  </Tag>
);

export const getPricingTableColumns = ({
  t,
  copyText,
  showRatio,
}) => {
  const renderBackendValue = (value) => {
    if (typeof value === 'boolean') {
      return renderYesNoTag(value);
    }
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
  };

  const modelNameColumn = {
    title: t('Model'),
    dataIndex: 'model_name',
    render: (text) => {
      return renderModelTag(text, {
        onClick: () => {
          copyText(text);
        },
      });
    },
    onFilter: (value, record) =>
      record.model_name.toLowerCase().includes(value.toLowerCase()),
  };

  const vendorColumn = {
    title: t('Provider'),
    dataIndex: 'vendor_name',
    render: (text) => text || '-',
  };

  const toolCallColumn = {
    title: t('Tool Call'),
    dataIndex: 'tool_call',
    render: (text) => renderBackendValue(text),
  };

  const reasoningColumn = {
    title: t('Reasoning'),
    dataIndex: 'reasoning',
    render: (text) => renderBackendValue(text),
  };

  const inputColumn = {
    title: t('Input'),
    dataIndex: 'input',
    render: (text) => renderBackendValue(text),
  };

  const columns = [
    vendorColumn,
    modelNameColumn,
    toolCallColumn,
    reasoningColumn,
    inputColumn,
  ];

  if (showRatio) {
    columns.push({
      title: t('倍率'),
      dataIndex: 'ratio',
      render: (text, record) => {
        if (record?.used_group_ratio !== undefined) {
          return `${record.used_group_ratio}x`;
        }
        return '-';
      },
    });
  }

  return columns.map((column) => ({
    ...column,
    ellipsis: true,
  }));
};
