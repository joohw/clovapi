import React from 'react';
import {
  Button,
  Dropdown,
  Tag,
  Popover,
  Typography,
  Input,
  Modal,
} from '@douyinfe/semi-ui';
import { timestamp2string, renderQuota } from '../../../helpers';
import {
  IconCopy,
  IconEyeOpened,
  IconEyeClosed,
} from '@douyinfe/semi-icons';

// Render functions
function renderTimestamp(timestamp) {
  return <>{timestamp2string(timestamp)}</>;
}

// Render status column only (no usage)
const renderStatus = (text, record, t) => {
  const enabled = text === 1;

  let tagColor = 'black';
  let tagText = "未知状态";
  if (enabled) {
    tagColor = 'green';
    tagText = "已启用";
  } else if (text === 2) {
    tagColor = 'red';
    tagText = "已禁用";
  } else if (text === 3) {
    tagColor = 'yellow';
    tagText = "已过期";
  } else if (text === 4) {
    tagColor = 'grey';
    tagText = "已耗尽";
  }

  return (
    <Tag color={tagColor} shape='circle' size='small'>
      {tagText}
    </Tag>
  );
};

// Render token key column with show/hide and copy functionality
const renderTokenKey = (
  text,
  record,
  showKeys,
  resolvedTokenKeys,
  loadingTokenKeys,
  toggleTokenVisibility,
  copyTokenKey,
  copyTokenConnectionString,
  t,
) => {
  const revealed = !!showKeys[record.id];
  const loading = !!loadingTokenKeys[record.id];
  const keyValue =
    revealed && resolvedTokenKeys[record.id]
      ? resolvedTokenKeys[record.id]
      : record.key || '';
  const displayedKey = keyValue ? `sk-${keyValue}` : '';

  return (
    <div className='w-[200px]'>
      <Input
        readOnly
        value={displayedKey}
        size='small'
        suffix={
          <div className='flex items-center'>
            <Button
              theme='borderless'
              size='small'
              type='tertiary'
              icon={revealed ? <IconEyeClosed /> : <IconEyeOpened />}
              loading={loading}
              aria-label='toggle token visibility'
              onClick={async (e) => {
                e.stopPropagation();
                await toggleTokenVisibility(record);
              }}
            />
            <Dropdown
              trigger='click'
              position='bottomRight'
              clickToHide
              menu={[
                {
                  node: 'item',
                  name: "复制密钥",
                  onClick: () => copyTokenKey(record),
                },
                {
                  node: 'item',
                  name: "复制连接信息",
                  onClick: () => copyTokenConnectionString(record),
                },
              ]}
            >
              <Button
                theme='borderless'
                size='small'
                type='tertiary'
                icon={<IconCopy />}
                loading={loading}
                aria-label='copy token key'
                onClick={async (e) => {
                  e.stopPropagation();
                }}
              />
            </Dropdown>
          </div>
        }
      />
    </div>
  );
};

// Render separate quota usage column
const renderQuotaUsage = (text, record, t) => {
  const { Paragraph } = Typography;
  const used = parseInt(record.used_quota) || 0;
  const remain = parseInt(record.remain_quota) || 0;
  const total = used + remain;
  if (record.unlimited_quota) {
    const popoverContent = (
      <div className='text-xs p-2'>
        <Paragraph copyable={{ content: renderQuota(used) }}>
          {"已用额度"}: {renderQuota(used)}
        </Paragraph>
      </div>
    );
    return (
      <Popover content={popoverContent} position='top'>
        <Tag color='white' shape='circle'>
          {"无限额度"}
        </Tag>
      </Popover>
    );
  }
  const percent = total > 0 ? (remain / total) * 100 : 0;
  const popoverContent = (
    <div className='text-xs p-2'>
      <Paragraph copyable={{ content: renderQuota(used) }}>
        {"已用额度"}: {renderQuota(used)}
      </Paragraph>
      <Paragraph copyable={{ content: renderQuota(remain) }}>
        {"剩余额度"}: {renderQuota(remain)} ({percent.toFixed(0)}%)
      </Paragraph>
      <Paragraph copyable={{ content: renderQuota(total) }}>
        {"总额度"}: {renderQuota(total)}
      </Paragraph>
    </div>
  );
  return (
    <Popover content={popoverContent} position='top'>
      <Tag color='white' shape='circle'>
        <span className='whitespace-nowrap text-xs'>{`${renderQuota(remain)} / ${renderQuota(total)} (${percent.toFixed(0)}%)`}</span>
      </Tag>
    </Popover>
  );
};

const renderToggleAction = (
  record,
  manageToken,
  refresh,
) => {
  return (
    <Button
      type={record.status === 1 ? 'danger' : 'primary'}
      size='small'
      className='whitespace-nowrap'
      onClick={async () => {
        await manageToken(
          record.id,
          record.status === 1 ? 'disable' : 'enable',
          record,
        );
        await refresh();
      }}
    >
      {record.status === 1 ? "禁用" : "启用"}
    </Button>
  );
};

const renderEditAction = (record, setEditingToken, setShowEdit) => (
  <Button
    type='tertiary'
    size='small'
    className='whitespace-nowrap'
    onClick={() => {
      setEditingToken(record);
      setShowEdit(true);
    }}
  >
    {"编辑"}
  </Button>
);

const renderDeleteAction = (record, manageToken, refresh) => (
  <Button
    type='danger'
    size='small'
    className='whitespace-nowrap'
    onClick={() => {
      Modal.confirm({
        title: "确定是否要删除此令牌？",
        content: "此修改将不可逆",
        onOk: () => {
          (async () => {
            await manageToken(record.id, 'delete', record);
            await refresh();
          })();
        },
      });
    }}
  >
    {"删除"}
  </Button>
);

export const getTokensColumns = ({
  t,
  showKeys,
  resolvedTokenKeys,
  loadingTokenKeys,
  toggleTokenVisibility,
  copyTokenKey,
  copyTokenConnectionString,
  manageToken,
  setEditingToken,
  setShowEdit,
  refresh,
}) => {
  return [
    {
      title: "名称",
      dataIndex: 'name',
      ellipsis: true,
    },
    {
      title: "状态",
      dataIndex: 'status',
      key: 'status',
      render: (text, record) => renderStatus(text, record, t),
    },
    {
      title: "剩余额度/总额度",
      key: 'quota_usage',
      ellipsis: true,
      render: (text, record) => renderQuotaUsage(text, record, t),
    },
    {
      title: "密钥",
      key: 'token_key',
      render: (text, record) =>
        renderTokenKey(
          text,
          record,
          showKeys,
          resolvedTokenKeys,
          loadingTokenKeys,
          toggleTokenVisibility,
          copyTokenKey,
          copyTokenConnectionString,
          t,
        ),
    },
    {
      title: "过期时间",
      dataIndex: 'expired_time',
      ellipsis: true,
      render: (text, record, index) => {
        return (
          <div>
            {record.expired_time === -1 ? "永不过期" : renderTimestamp(text)}
          </div>
        );
      },
    },
    {
      title: "禁用",
      key: 'toggle_action',
      width: 90,
      render: (text, record, index) =>
        renderToggleAction(
          record,
          manageToken,
          refresh,
        ),
    },
    {
      title: "编辑",
      key: 'edit_action',
      width: 80,
      render: (text, record) => renderEditAction(record, setEditingToken, setShowEdit),
    },
    {
      title: "删除",
      key: 'delete_action',
      width: 80,
      render: (text, record) => renderDeleteAction(record, manageToken, refresh),
    },
  ];
};
