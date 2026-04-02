import React, { useEffect, useState, useRef } from 'react';
import {
  Button,
  Col,
  Form,
  Row,
  Spin,
  DatePicker,
  Typography,
  Modal,
} from '@douyinfe/semi-ui';
import dayjs from 'dayjs';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';

const { Text } = Typography;

export default function SettingsLog(props) {
  const [loading, setLoading] = useState(false);
  const [loadingCleanHistoryLog, setLoadingCleanHistoryLog] = useState(false);
  const [inputs, setInputs] = useState({
    LogConsumeEnabled: false,
    'conversation_store_setting.enabled': true,
    'conversation_store_setting.mode': 'db',
    'conversation_store_setting.sample_rate': 1,
    'conversation_store_setting.max_capture_bytes': 0,
    'conversation_store_setting.include_paths': '',
    'conversation_store_setting.exclude_paths': '',
    'conversation_store_setting.file_dir': './data/conversations',
    'conversation_store_setting.redact_sensitive': true,
    historyTimestamp: dayjs().subtract(1, 'month').toDate(),
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow).filter(
      (item) => item.key !== 'historyTimestamp',
    );

    if (!updateArray.length) return showWarning("你似乎并没有修改什么");
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (
        item.key === 'conversation_store_setting.include_paths' ||
        item.key === 'conversation_store_setting.exclude_paths'
      ) {
        const lines = String(inputs[item.key] || '')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '');
        value = JSON.stringify(lines);
      } else if (
        item.key === 'conversation_store_setting.sample_rate' ||
        item.key === 'conversation_store_setting.max_capture_bytes'
      ) {
        value = String(inputs[item.key] ?? '');
      } else if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else {
        value = inputs[item.key];
      }
      return API.put('/api/option/', {
        key: item.key,
        value,
      });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined))
            return showError("部分保存失败，请重试");
        }
        showSuccess("保存成功");
        props.refresh();
      })
      .catch(() => {
        showError("保存失败，请重试");
      })
      .finally(() => {
        setLoading(false);
      });
  }
  async function onCleanHistoryLog() {
    if (!inputs.historyTimestamp) {
      showError("请选择日志记录时间");
      return;
    }

    const now = dayjs();
    const targetDate = dayjs(inputs.historyTimestamp);
    const targetTime = targetDate.format('YYYY-MM-DD HH:mm:ss');
    const currentTime = now.format('YYYY-MM-DD HH:mm:ss');
    const daysDiff = now.diff(targetDate, 'day');

    Modal.confirm({
      title: "确认清除历史日志",
      content: (
        <div style={{ lineHeight: '1.8' }}>
          <p>
            <Text>{"当前时间"}：</Text>
            <Text strong style={{ color: '#52c41a' }}>
              {currentTime}
            </Text>
          </p>
          <p>
            <Text>{"选择时间"}：</Text>
            <Text strong type='danger'>
              {targetTime}
            </Text>
            {daysDiff > 0 && (
              <Text type='tertiary'>
                {' '}
                ({"约"} {daysDiff} {"天前"})
              </Text>
            )}
          </p>
          <div
            style={{
              background: '#fff7e6',
              border: '1px solid #ffd591',
              padding: '12px',
              borderRadius: '4px',
              marginTop: '12px',
              color: '#333',
            }}
          >
            <Text strong style={{ color: '#d46b08' }}>
              ⚠️ {"注意"}：
            </Text>
            <Text style={{ color: '#333' }}>{"将删除"} </Text>
            <Text strong style={{ color: '#cf1322' }}>
              {targetTime}
            </Text>
            {daysDiff > 0 && (
              <Text style={{ color: '#8c8c8c' }}>
                {' '}
                ({"约"} {daysDiff} {"天前"})
              </Text>
            )}
            <Text style={{ color: '#333' }}> {"之前的所有日志"}</Text>
          </div>
          <p style={{ marginTop: '12px' }}>
            <Text type='danger'>
              {"此操作不可恢复，请仔细确认时间后再操作！"}
            </Text>
          </p>
        </div>
      ),
      okText: "确认删除",
      cancelText: "取消",
      okType: 'danger',
      onOk: async () => {
        try {
          setLoadingCleanHistoryLog(true);
          const res = await API.delete(
            `/api/log/?target_timestamp=${Date.parse(inputs.historyTimestamp) / 1000}`,
          );
          const { success, message, data } = res.data;
          if (success) {
            showSuccess(`${data} ${"条日志已清理！"}`);
            return;
          } else {
            throw new Error("日志清理失败：" + message);
          }
        } catch (error) {
          showError(error.message);
        } finally {
          setLoadingCleanHistoryLog(false);
        }
      },
    });
  }

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        if (
          key === 'conversation_store_setting.include_paths' ||
          key === 'conversation_store_setting.exclude_paths'
        ) {
          try {
            const parsed = JSON.parse(props.options[key] || '[]');
            currentInputs[key] = Array.isArray(parsed) ? parsed.join('\n') : '';
          } catch {
            currentInputs[key] = '';
          }
        } else {
          currentInputs[key] = props.options[key];
        }
      }
    }
    currentInputs['historyTimestamp'] = inputs.historyTimestamp;
    setInputs(Object.assign(inputs, currentInputs));
    setInputsRow(structuredClone(currentInputs));
    refForm.current.setValues(currentInputs);
  }, [props.options]);
  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={"日志设置"}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'LogConsumeEnabled'}
                  label={"启用额度消费日志记录"}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      LogConsumeEnabled: value,
                    });
                  }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Spin spinning={loadingCleanHistoryLog}>
                  <Form.DatePicker
                    label={"清除历史日志"}
                    field={'historyTimestamp'}
                    type='dateTime'
                    inputReadOnly={true}
                    onChange={(value) => {
                      setInputs({
                        ...inputs,
                        historyTimestamp: value,
                      });
                    }}
                  />
                  <Text
                    type='tertiary'
                    size='small'
                    style={{ display: 'block', marginTop: 4, marginBottom: 8 }}
                  >
                    {"将清除选定时间之前的所有日志"}
                  </Text>
                  <Button
                    size='default'
                    type='danger'
                    onClick={onCleanHistoryLog}
                  >
                    {"清除历史日志"}
                  </Button>
                </Spin>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'conversation_store_setting.enabled'}
                  label={"启用对话采集"}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      'conversation_store_setting.enabled': value,
                    });
                  }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Select
                  field={'conversation_store_setting.mode'}
                  label={"采集存储模式"}
                  optionList={[
                    { label: 'DB', value: 'db' },
                    { label: 'File', value: 'file' },
                    { label: 'DB + File', value: 'db_and_file' },
                  ]}
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      'conversation_store_setting.mode': value,
                    });
                  }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Input
                  field={'conversation_store_setting.sample_rate'}
                  label={"采样率(0~1)"}
                  placeholder='1'
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      'conversation_store_setting.sample_rate': value,
                    });
                  }}
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Input
                  field={'conversation_store_setting.max_capture_bytes'}
                  label={"最大捕获字节数"}
                  placeholder='0'
                  extraText={"<=0 表示不截断并落盘"}
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      'conversation_store_setting.max_capture_bytes': value,
                    });
                  }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Input
                  field={'conversation_store_setting.file_dir'}
                  label={"文件存储目录"}
                  placeholder='./data/conversations'
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      'conversation_store_setting.file_dir': value,
                    });
                  }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'conversation_store_setting.redact_sensitive'}
                  label={"脱敏敏感信息"}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      'conversation_store_setting.redact_sensitive': value,
                    });
                  }}
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={12} lg={12} xl={12}>
                <Form.TextArea
                  field={'conversation_store_setting.include_paths'}
                  label={"采集路径白名单(每行一个)"}
                  placeholder={'/v1/chat/completions\n/pg/chat/completions'}
                  autosize
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      'conversation_store_setting.include_paths': value,
                    });
                  }}
                />
              </Col>
              <Col xs={24} sm={12} md={12} lg={12} xl={12}>
                <Form.TextArea
                  field={'conversation_store_setting.exclude_paths'}
                  label={"采集路径黑名单(每行一个)"}
                  placeholder={'/api/status'}
                  autosize
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      'conversation_store_setting.exclude_paths': value,
                    });
                  }}
                />
              </Col>
            </Row>

            <Row>
              <Button size='default' onClick={onSubmit}>
                {"保存日志设置"}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
