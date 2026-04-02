import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Spin,
  Typography,
  Button,
} from '@douyinfe/semi-ui';
import { IconCopy } from '@douyinfe/semi-icons';
import { API, copy, showError, showSuccess } from '../../../../helpers';
import './ConversationDetailModal.css';

const { Text } = Typography;

function formatJsonIfPossible(rawText) {
  const text = typeof rawText === 'string' ? rawText : String(rawText || '');
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object') {
      return JSON.stringify(parsed, null, 2);
    }
  } catch (e) {
    // Keep original content for non-JSON payloads.
  }
  return text;
}

async function fetchBody(isAdmin, requestId) {
  const base = isAdmin
    ? '/api/log/conversation/body'
    : '/api/log/self/conversation/body';
  const res = await API.get(base, {
    params: { request_id: requestId },
    disableDuplicate: true,
  });
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || 'request failed');
  }
  return data?.body ?? '';
}

const ConversationDetailModal = ({
  t,
  isAdminUser,
  showConversationDetailModal,
  setShowConversationDetailModal,
  conversationDetailTarget,
}) => {
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState(null);
  const [mergedBody, setMergedBody] = useState('');
  const requestSeqRef = useRef(0);

  const requestId = useMemo(
    () => String(conversationDetailTarget?.requestId || '').trim(),
    [conversationDetailTarget],
  );

  useEffect(() => {
    if (!showConversationDetailModal) {
      requestSeqRef.current += 1;
      setLoading(false);
      setRecord(null);
      setMergedBody('');
      return;
    }
    if (!requestId) {
      setLoading(false);
      setRecord(null);
      return;
    }

    const reqSeq = (requestSeqRef.current += 1);
    setRecord(null);
    setMergedBody('');
    setLoading(true);

    const load = async () => {
      try {
        const path = isAdminUser
          ? '/api/log/conversation'
          : '/api/log/self/conversation';
        const res = await API.get(path, {
          params: { request_id: requestId },
          disableDuplicate: true,
        });
        if (reqSeq !== requestSeqRef.current) return;
        const { success, message, data } = res.data || {};
        if (!success) {
          setRecord(null);
          showError(message || '请求失败');
          return;
        }
        setRecord(data || null);
        if (!data) {
          return;
        }
        let merged = '';
        try {
          merged = await fetchBody(isAdminUser, requestId);
        } catch (e) {
          merged = '';
        }
        if (reqSeq !== requestSeqRef.current) return;
        setMergedBody(merged);
      } catch (e) {
        if (reqSeq !== requestSeqRef.current) return;
        setRecord(null);
        showError("请求失败");
      } finally {
        if (reqSeq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    };
    load();
  }, [showConversationDetailModal, requestId, isAdminUser, t]);

  const displayBody = useMemo(() => formatJsonIfPossible(mergedBody), [mergedBody]);

  const copyAll = async () => {
    const text = displayBody || '';
    if (!text.trim()) return;
    if (await copy(text)) {
      showSuccess("已复制");
    } else {
      showError("无法复制到剪贴板，请手动复制");
    }
  };

  const metaRows = useMemo(() => {
    if (!record) return [];
    const rows = [];
    if (record.path) rows.push({ key: "路径", value: record.path });
    if (record.method) rows.push({ key: "方法", value: record.method });
    if (record.model_name) rows.push({ key: "模型", value: record.model_name });
    if (record.status_code != null) {
      rows.push({ key: 'HTTP', value: String(record.status_code) });
    }
    rows.push({
      key: "流式",
      value: record.is_stream ? "是" : "否",
    });
    if (record.request_truncated) {
      rows.push({ key: "请求体", value: "已截断（见配置）" });
    }
    if (record.response_truncated) {
      rows.push({ key: "响应体", value: "已截断（见配置）" });
    }
    return rows;
  }, [record, t]);

  return (
    <Modal
      title={"对话详情"}
      visible={showConversationDetailModal}
      onCancel={() => setShowConversationDetailModal(false)}
      footer={null}
      centered
      closable
      maskClosable
      width={900}
    >
      <div className='conversation-detail-modal__container'>
        <div className='conversation-detail-modal__header'>
          <Text type='tertiary' size='small'>
            {requestId ? `${"Request ID"}: ${requestId}` : ''}
          </Text>
          <Button
            icon={<IconCopy />}
            theme='borderless'
            type='tertiary'
            size='small'
            onClick={copyAll}
            disabled={!mergedBody}
          >
            {"复制全部"}
          </Button>
        </div>
        <Spin spinning={loading} tip={"加载中..."}>
          {!loading && !record ? (
            <Text type='tertiary' size='small'>
              {"暂无对话记录"}
            </Text>
          ) : null}
          {record && metaRows.length > 0 ? (
            <div className='conversation-detail-modal__meta'>
              {metaRows.map((row) => (
                <div key={row.key} className='conversation-detail-modal__meta-row'>
                  <Text type='tertiary' className='conversation-detail-modal__meta-key'>
                    {row.key}
                  </Text>
                  <Text className='conversation-detail-modal__meta-value'>
                    {row.value}
                  </Text>
                </div>
              ))}
            </div>
          ) : null}
          {record ? (
            <div className='conversation-detail-modal__content'>
              <pre className='conversation-detail-modal__content-pre'>
                {displayBody || '(empty)'}
              </pre>
            </div>
          ) : null}
        </Spin>
      </div>
    </Modal>
  );
};

export default ConversationDetailModal;
