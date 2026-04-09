import React, { useEffect, useState, useRef } from 'react';
import { Button, Form, Spin } from '@douyinfe/semi-ui';
import {
  API,
  removeTrailingSlash,
  showError,
  showSuccess,
} from '../../../helpers';
export default function SettingsGeneralPayment(props) {
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    ServerAddress: '',
  });
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const currentInputs = {
        ServerAddress: props.options.ServerAddress || '',
      };
      setInputs(currentInputs);
      formApiRef.current.setValues(currentInputs);
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitServerAddress = async () => {
    setLoading(true);
    try {
      let ServerAddress = removeTrailingSlash(inputs.ServerAddress);
      const res = await API.put('/api/option/', {
        key: 'ServerAddress',
        value: ServerAddress,
      });
      if (res.data.success) {
        showSuccess("更新成功");
        props.refresh && props.refresh();
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError("更新失败");
    }
    setLoading(false);
  };

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={"通用设置"}>
          <Form.Input
            field='ServerAddress'
            label={"服务器地址"}
            placeholder={'https://yourdomain.com'}
            style={{ width: '100%' }}
            extraText={"该服务器地址将影响支付回调地址以及默认首页展示的地址，请确保正确配置"}
          />
          <Button onClick={submitServerAddress}>{"更新服务器地址"}</Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}
