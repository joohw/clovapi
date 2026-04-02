import React, { useEffect, useState, useRef } from 'react';
import {
  API,
  showError,
  showSuccess,
  timestamp2string,
  renderQuotaWithPrompt,
} from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  Button,
  Modal,
  Spin,
  Form,
} from '@douyinfe/semi-ui';
import { IconSave } from '@douyinfe/semi-icons';

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
        remain_quota: data.unlimited_quota ? '' : data.remain_quota,
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

    if (values.remain_quota === '' || values.remain_quota === null) {
      localInputs.unlimited_quota = true;
      localInputs.remain_quota = 0;
    } else {
      localInputs.unlimited_quota = false;
      localInputs.remain_quota = parseInt(values.remain_quota, 10) || 0;
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
        showSuccess("ApiKey 更新成功！");
        props.refresh();
        props.handleClose();
      } else {
        showError(message);
      }
    } else {
      let res = await API.post(`/api/token/`, localInputs);
      const { success, message } = res.data;
      if (success) {
        showSuccess("ApiKey 创建成功，请在列表点击复制获取密钥！");
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
      title={isEdit ? 'Edit ApiKey' : 'Create ApiKey'}
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
            {isEdit ? 'Save' : 'Create'}
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
                label={"Name"}
                placeholder={'e.g. "Chatbot Key"'}
                rules={[{ required: true, message: "请输入名称" }]}
                showClear
              />
              <Form.InputNumber
                field='remain_quota'
                label={"Credit limit (optional)"}
                placeholder={"Leave blank for unlimited"}
                min={0}
                hideButtons
                style={{ width: '100%' }}
                extraText={renderQuotaWithPrompt(
                  formApiRef.current?.getValue('remain_quota') || 0,
                )}
              />
              <Form.Select
                field='expired_time'
                label={"Expiration"}
                optionList={[
                  { label: 'No expiration', value: 'never' },
                  { label: '1 hour', value: '1h' },
                  { label: '1 day', value: '1d' },
                  { label: '1 month', value: '1m' },
                ]}
              />
            </div>
          )}
        </Form>
      </Spin>
    </Modal>
  );
};

export default EditTokenModal;
