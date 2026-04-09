import React, { useMemo } from 'react';
import {
  Modal,
  Button,
  Empty,
  Divider,
  Typography,
} from '@douyinfe/semi-ui';
import { IconCopy } from '@douyinfe/semi-icons';
import { copy, showError, showSuccess } from '../../../../helpers';

const { Text } = Typography;

const parseAuditLine = (line) => {
  if (typeof line !== 'string') {
    return null;
  }
  const firstSpaceIndex = line.indexOf(' ');
  if (firstSpaceIndex <= 0) {
    return { action: line, content: line };
  }
  return {
    action: line.slice(0, firstSpaceIndex),
    content: line.slice(firstSpaceIndex + 1),
  };
};

const getActionLabel = (action, t) => {
  switch ((action || '').toLowerCase()) {
    case 'set':
      return "设置";
    case 'delete':
      return "删除";
    case 'copy':
      return "复制";
    case 'move':
      return "移动";
    case 'append':
      return "追加";
    case 'prepend':
      return "前置";
    case 'trim_prefix':
      return "去前缀";
    case 'trim_suffix':
      return "去后缀";
    case 'ensure_prefix':
      return "保前缀";
    case 'ensure_suffix':
      return "保后缀";
    case 'trim_space':
      return "去空格";
    case 'to_lower':
      return "转小写";
    case 'to_upper':
      return "转大写";
    case 'replace':
      return "替换";
    case 'regex_replace':
      return "正则替换";
    case 'set_header':
      return "设请求头";
    case 'delete_header':
      return "删请求头";
    case 'copy_header':
      return "复制请求头";
    case 'move_header':
      return "移动请求头";
    case 'pass_headers':
      return "透传请求头";
    case 'sync_fields':
      return "同步字段";
    case 'return_error':
      return "返回错误";
    default:
      return action;
  }
};

const ParamOverrideModal = ({
  showParamOverrideModal,
  setShowParamOverrideModal,
  paramOverrideTarget,
  t,
}) => {
  const lines = Array.isArray(paramOverrideTarget?.lines)
    ? paramOverrideTarget.lines
    : [];

  const parsedLines = useMemo(() => {
    return lines.map(parseAuditLine);
  }, [lines]);

  const copyAll = async () => {
    const content = lines.join('\n');
    if (!content) {
      return;
    }
    if (await copy(content)) {
      showSuccess("参数覆盖已复制");
      return;
    }
    showError("无法复制到剪贴板，请手动复制");
  };

  return (
    <Modal
      title={"参数覆盖详情"}
      visible={showParamOverrideModal}
      onCancel={() => setShowParamOverrideModal(false)}
      footer={null}
      centered
      closable
      maskClosable
      width={640}
    >
      <div style={{ padding: '8px 20px 20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ marginBottom: 4 }}>
              <Text style={{ fontWeight: 600 }}>
                {`${lines.length} 项操作`}
              </Text>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                fontSize: 12,
                color: 'var(--semi-color-text-2)',
              }}
            >
              {paramOverrideTarget?.modelName ? (
                <Text type='tertiary' size='small'>
                  {paramOverrideTarget.modelName}
                </Text>
              ) : null}
              {paramOverrideTarget?.requestId ? (
                <Text type='tertiary' size='small'>
                  {"Request ID"}: {paramOverrideTarget.requestId}
                </Text>
              ) : null}
              {paramOverrideTarget?.requestPath ? (
                <Text type='tertiary' size='small'>
                  {"请求路径"}: {paramOverrideTarget.requestPath}
                </Text>
              ) : null}
            </div>
          </div>

          <Button
            icon={<IconCopy />}
            theme='borderless'
            type='tertiary'
            size='small'
            onClick={copyAll}
            disabled={lines.length === 0}
          >
            {"复制"}
          </Button>
        </div>

        <Divider margin='12px' />

        {lines.length === 0 ? (
          <Empty
            description={"暂无参数覆盖记录"}
            style={{ padding: '24px 0 8px' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: '56vh',
              overflowY: 'auto',
              paddingRight: 2,
            }}
          >
            {parsedLines.map((item, index) => {
              if (!item) {
                return null;
              }

              return (
                <div
                  key={`${item.action}-${index}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--semi-color-border)',
                    background: 'var(--semi-color-fill-0)',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      flex: '0 0 auto',
                      minWidth: 74,
                    }}
                  >
                    <Text
                      style={{
                        display: 'inline-block',
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: '20px',
                        padding: '0 8px',
                        borderRadius: 999,
                        background: 'rgba(var(--semi-blue-5), 0.12)',
                        color: 'var(--semi-color-primary)',
                      }}
                    >
                      {getActionLabel(item.action, t)}
                    </Text>
                  </div>
                  <Text
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace',
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: 'var(--semi-color-text-0)',
                    }}
                  >
                    {item.content}
                  </Text>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ParamOverrideModal;
