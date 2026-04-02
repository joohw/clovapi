import React from 'react';
import {
  Button,
  Modal,
  Space,
  Tag,
  Typography,
  Popover,
  Divider,
  Badge,
  Tooltip,
} from '@douyinfe/semi-ui';
import { renderQuota } from '../../../helpers';
import { convertUSDToCurrency } from '../../../helpers/render';

const { Text } = Typography;

function formatDuration(plan, t) {
  if (!plan) return '';
  const u = plan.duration_unit || 'month';
  if (u === 'custom') {
    return `${"自定义"} ${plan.custom_seconds || 0}s`;
  }
  const unitMap = {
    year: "年",
    month: "月",
    day: "日",
    hour: "小时",
  };
  return `${plan.duration_value || 0}${unitMap[u] || u}`;
}

function formatResetPeriod(plan, t) {
  const period = plan?.quota_reset_period || 'never';
  if (period === 'daily') return "每天";
  if (period === 'weekly') return "每周";
  if (period === 'monthly') return "每月";
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${"天"}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${"小时"}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${"分钟"}`;
    return `${seconds} ${"秒"}`;
  }
  return "不重置";
}

const renderPlanTitle = (text, record, t) => {
  const subtitle = record?.plan?.subtitle;
  const plan = record?.plan;
  const popoverContent = (
    <div style={{ width: 260 }}>
      <Text strong>{text}</Text>
      {subtitle && (
        <Text type='tertiary' style={{ display: 'block', marginTop: 4 }}>
          {subtitle}
        </Text>
      )}
      <Divider margin={12} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Text type='tertiary'>{"价格"}</Text>
        <Text strong style={{ color: 'var(--semi-color-success)' }}>
          {convertUSDToCurrency(Number(plan?.price_amount || 0), 2)}
        </Text>
        <Text type='tertiary'>{"总额度"}</Text>
        {plan?.total_amount > 0 ? (
          <Tooltip content={`${"原生额度"}：${plan.total_amount}`}>
            <Text>{renderQuota(plan.total_amount)}</Text>
          </Tooltip>
        ) : (
          <Text>{"不限"}</Text>
        )}
        <Text type='tertiary'>{"升级分组"}</Text>
        <Text>{plan?.upgrade_group ? plan.upgrade_group : "不升级"}</Text>
        <Text type='tertiary'>{"购买上限"}</Text>
        <Text>
          {plan?.max_purchase_per_user > 0
            ? plan.max_purchase_per_user
            : "不限"}
        </Text>
        <Text type='tertiary'>{"有效期"}</Text>
        <Text>{formatDuration(plan, t)}</Text>
        <Text type='tertiary'>{"重置"}</Text>
        <Text>{formatResetPeriod(plan, t)}</Text>
      </div>
    </div>
  );

  return (
    <Popover content={popoverContent} position='rightTop' showArrow>
      <div style={{ cursor: 'pointer', maxWidth: 180 }}>
        <Text strong ellipsis={{ showTooltip: false }}>
          {text}
        </Text>
        {subtitle && (
          <Text
            type='tertiary'
            ellipsis={{ showTooltip: false }}
            style={{ display: 'block' }}
          >
            {subtitle}
          </Text>
        )}
      </div>
    </Popover>
  );
};

const renderPrice = (text) => {
  return (
    <Text strong style={{ color: 'var(--semi-color-success)' }}>
      {convertUSDToCurrency(Number(text || 0), 2)}
    </Text>
  );
};

const renderPurchaseLimit = (text, record, t) => {
  const limit = Number(record?.plan?.max_purchase_per_user || 0);
  return (
    <Text type={limit > 0 ? 'secondary' : 'tertiary'}>
      {limit > 0 ? limit : "不限"}
    </Text>
  );
};

const renderDuration = (text, record, t) => {
  return <Text type='secondary'>{formatDuration(record?.plan, t)}</Text>;
};

const renderEnabled = (text, record, t) => {
  return text ? (
    <Tag
      color='white'
      shape='circle'
      type='light'
      prefixIcon={<Badge dot type='success' />}
    >
      {"启用"}
    </Tag>
  ) : (
    <Tag
      color='white'
      shape='circle'
      type='light'
      prefixIcon={<Badge dot type='danger' />}
    >
      {"禁用"}
    </Tag>
  );
};

const renderTotalAmount = (text, record, t) => {
  const total = Number(record?.plan?.total_amount || 0);
  return (
    <Text type={total > 0 ? 'secondary' : 'tertiary'}>
      {total > 0 ? (
        <Tooltip content={`${"原生额度"}：${total}`}>
          <span>{renderQuota(total)}</span>
        </Tooltip>
      ) : (
        "不限"
      )}
    </Text>
  );
};

const renderUpgradeGroup = (text, record, t) => {
  const group = record?.plan?.upgrade_group || '';
  return (
    <Text type={group ? 'secondary' : 'tertiary'}>
      {group ? group : "不升级"}
    </Text>
  );
};

const renderResetPeriod = (text, record, t) => {
  const period = record?.plan?.quota_reset_period || 'never';
  const isNever = period === 'never';
  return (
    <Text type={isNever ? 'tertiary' : 'secondary'}>
      {formatResetPeriod(record?.plan, t)}
    </Text>
  );
};

const renderPaymentConfig = (text, record, t, enableEpay) => {
  const hasStripe = !!record?.plan?.stripe_price_id;
  const hasCreem = !!record?.plan?.creem_product_id;
  const hasEpay = !!enableEpay;

  return (
    <Space spacing={4}>
      {hasStripe && (
        <Tag color='violet' shape='circle'>
          Stripe
        </Tag>
      )}
      {hasCreem && (
        <Tag color='cyan' shape='circle'>
          Creem
        </Tag>
      )}
      {hasEpay && (
        <Tag color='light-green' shape='circle'>
          {"易支付"}
        </Tag>
      )}
    </Space>
  );
};

const renderOperations = (text, record, { openEdit, setPlanEnabled, t }) => {
  const isEnabled = record?.plan?.enabled;

  const handleToggle = () => {
    if (isEnabled) {
      Modal.confirm({
        title: "确认禁用",
        content: "禁用后用户端不再展示，但历史订单不受影响。是否继续？",
        centered: true,
        onOk: () => setPlanEnabled(record, false),
      });
    } else {
      Modal.confirm({
        title: "确认启用",
        content: "启用后套餐将在用户端展示。是否继续？",
        centered: true,
        onOk: () => setPlanEnabled(record, true),
      });
    }
  };

  return (
    <Space spacing={8}>
      <Button
        theme='light'
        type='tertiary'
        size='small'
        onClick={() => openEdit(record)}
      >
        {"编辑"}
      </Button>
      {isEnabled ? (
        <Button theme='light' type='danger' size='small' onClick={handleToggle}>
          {"禁用"}
        </Button>
      ) : (
        <Button
          theme='light'
          type='primary'
          size='small'
          onClick={handleToggle}
        >
          {"启用"}
        </Button>
      )}
    </Space>
  );
};

export const getSubscriptionsColumns = ({
  t,
  openEdit,
  setPlanEnabled,
  enableEpay,
}) => {
  return [
    {
      title: 'ID',
      dataIndex: ['plan', 'id'],
      width: 60,
      render: (text) => <Text type='tertiary'>#{text}</Text>,
    },
    {
      title: "套餐",
      dataIndex: ['plan', 'title'],
      width: 200,
      render: (text, record) => renderPlanTitle(text, record, t),
    },
    {
      title: "价格",
      dataIndex: ['plan', 'price_amount'],
      width: 100,
      render: (text) => renderPrice(text),
    },
    {
      title: "购买上限",
      width: 90,
      render: (text, record) => renderPurchaseLimit(text, record, t),
    },
    {
      title: "优先级",
      dataIndex: ['plan', 'sort_order'],
      width: 80,
      render: (text) => <Text type='tertiary'>{Number(text || 0)}</Text>,
    },
    {
      title: "有效期",
      width: 100,
      render: (text, record) => renderDuration(text, record, t),
    },
    {
      title: "重置",
      width: 80,
      render: (text, record) => renderResetPeriod(text, record, t),
    },
    {
      title: "状态",
      dataIndex: ['plan', 'enabled'],
      width: 80,
      render: (text, record) => renderEnabled(text, record, t),
    },
    {
      title: "支付渠道",
      width: 180,
      render: (text, record) =>
        renderPaymentConfig(text, record, t, enableEpay),
    },
    {
      title: "总额度",
      width: 100,
      render: (text, record) => renderTotalAmount(text, record, t),
    },
    {
      title: "升级分组",
      width: 100,
      render: (text, record) => renderUpgradeGroup(text, record, t),
    },
    {
      title: "操作",
      dataIndex: 'operate',
      fixed: 'right',
      width: 160,
      render: (text, record) =>
        renderOperations(text, record, { openEdit, setPlanEnabled, t }),
    },
  ];
};
