import React, { useEffect, useState, useRef } from 'react';
import { API, showError, showSuccess } from '../../../../helpers';
import { quotaToUsdInputString, usdToQuota } from '../../../../helpers/quota';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  Button,
  Modal,
  Spin,
  Form,
} from '@douyinfe/semi-ui';
import { IconSave } from '@douyinfe/semi-icons';

const EXPIRATION_OPTIONS = [
  { value: 'never', label: '永不过期' },
  { value: '1h', label: '1 小时' },
  { value: '1d', label: '1 天' },
  { value: '1m', label: '1 个月' },
];

const EditTokenModal = (props) => {
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();
  const formApiRef = useRef(null);
  const isEdit = props.editingToken.id !== undefined;

  const getInitValues = () => ({
    name: '',
    remain_quota: '',
    expired_time: 'never',
  });

  const handleCancel = () => {
    props.handleClose();
  };

  const getExpirationOptionByTimestamp = (expiredTime) => {
    if (expiredTime === -1) return 'never';
    const now = Math.floor(Date.now() / 1000);
    const diff = expiredTime - now;
    if (diff <= 0) return '1d';
    if (diff <= 3600) return '1h';
    if (diff <= 86400) return '1d';
    if (diff <= 30 * 24 * 3600) return '1m';
    return '1m';
  };

  const loadToken = async () => {
    setLoading(true);
    let res = await API.get(`/api/token/${props.editingToken.id}`);
    const { success, message, data } = res.data;
    if (success) {
      const normalizedData = {
        ...data,
        expired_time: getExpirationOptionByTimestamp(data.expired_time),
        remain_quota: data.unlimited_quota
          ? ''
          : quotaToUsdInputString(data.remain_quota),
      };
      if (formApiRef.current) {
        formApiRef.current.setValues({ ...getInitValues(), ...normalizedData });
      }
    } else {
      showError(message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (formApiRef.current) {
      if (!isEdit) {
        formApiRef.current.setValues(getInitValues());
      }
    }
  }, [props.editingToken.id]);

  useEffect(() => {
    if (props.visiable) {
      if (isEdit) {
        loadToken();
      } else {
        formApiRef.current?.setValues(getInitValues());
      }
    } else {
      formApiRef.current?.reset();
    }
  }, [props.visiable, props.editingToken.id]);

  const submit = async (values) => {
    setLoading(true);
    let localInputs = {
      name: values.name,
    };

    if (
      values.remain_quota === '' ||
      values.remain_quota === null ||
      values.remain_quota === undefined
    ) {
      localInputs.unlimited_quota = true;
      localInputs.remain_quota = 0;
    } else {
      const usd = parseFloat(values.remain_quota);
      if (!Number.isFinite(usd) || usd < 0) {
        showError("金额无效");
        setLoading(false);
        return;
      }
      localInputs.unlimited_quota = false;
      localInputs.remain_quota = usdToQuota(usd);
    }

    const now = Math.floor(Date.now() / 1000);
    switch (values.expired_time) {
      case '1h':
        localInputs.expired_time = now + 3600;
        break;
      case '1d':
        localInputs.expired_time = now + 24 * 3600;
        break;
      case '1m':
        localInputs.expired_time = now + 30 * 24 * 3600;
        break;
      default:
        localInputs.expired_time = -1;
        break;
    }

    if (isEdit) {
      let res = await API.put(`/api/token/`, {
        ...localInputs,
        id: parseInt(props.editingToken.id),
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess("密钥更新成功！");
        props.refresh();
        props.handleClose();
      } else {
        showError(message);
      }
    } else {
      let res = await API.post(`/api/token/`, localInputs);
      const { success, message } = res.data;
      if (success) {
        showSuccess("密钥创建成功，请在列表中点击复制以获取完整密钥！");
        props.refresh();
        props.handleClose();
      } else {
        showError(message);
      }
    }
    setLoading(false);
    formApiRef.current?.setValues(getInitValues());
  };

  return (
    <Modal
      centered
      title={isEdit ? '编辑密钥' : '创建密钥'}
      visible={props.visiable}
      width={isMobile ? '100%' : 520}
      footer={
        <div
          className='flex justify-end gap-2'
          style={{ backgroundColor: 'var(--semi-color-bg-2)' }}
        >
          <Button
            theme='solid'
            type='primary'
            className='!rounded-lg'
            onClick={() => formApiRef.current?.submitForm()}
            icon={<IconSave />}
            loading={loading}
          >
            {isEdit ? '保存' : '创建'}
          </Button>
        </div>
      }
      closable={true}
      bodyStyle={{
        padding: 20,
        backgroundColor: 'var(--semi-color-bg-2)',
      }}
      maskClosable={false}
      onCancel={() => handleCancel()}
    >
      <Spin spinning={loading}>
        <Form
          key={isEdit ? 'edit' : 'new'}
          initValues={getInitValues()}
          getFormApi={(api) => (formApiRef.current = api)}
          onSubmit={submit}
          labelPosition='top'
        >
          {() => (
            <div>
              <Form.Input
                field='name'
                label={"名称"}
                placeholder={"请输入密钥名称，例如「聊天机器人」"}
                rules={[{ required: true, message: "请输入名称" }]}
                showClear
              />
              <Form.InputNumber
                field='remain_quota'
                label={"额度上限（美元，可选）"}
                placeholder={"留空表示不限制"}
                min={0}
                precision={2}
                step={0.01}
                hideButtons
                style={{ width: '100%' }}
              />
              <Form.Select
                field='expired_time'
                label={"过期时间"}
                placeholder={"请选择过期时间"}
                style={{ width: '100%' }}
                emptyContent={"暂无数据"}
                optionList={EXPIRATION_OPTIONS}
              />
            </div>
          )}
        </Form>
      </Spin>
    </Modal>
  );
};

export default EditTokenModal;
