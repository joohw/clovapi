import React, { useState, useRef } from 'react';
import { API, showError, showSuccess } from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  Button,
  SideSheet,
  Space,
  Spin,
  Typography,
  Card,
  Tag,
  Avatar,
  Form,
  Row,
  Col,
} from '@douyinfe/semi-ui';
import { IconSave, IconClose, IconUserAdd } from '@douyinfe/semi-icons';
const { Text, Title } = Typography;

const AddUserModal = (props) => {
  const formApiRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();

  const getInitValues = () => ({
    username: '',
    display_name: '',
    password: '',
    remark: '',
  });

  const submit = async (values) => {
    setLoading(true);
    const res = await API.post(`/api/user/`, values);
    const { success, message } = res.data;
    if (success) {
      showSuccess("用户账户创建成功！");
      formApiRef.current?.setValues(getInitValues());
      props.refresh();
      props.handleClose();
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const handleCancel = () => {
    props.handleClose();
  };

  return (
    <>
      <SideSheet
        placement={'left'}
        title={
          <Space>
            <Tag color='green' shape='circle'>
              {"新建"}
            </Tag>
            <Title heading={4} className='m-0'>
              {"添加用户"}
            </Title>
          </Space>
        }
        bodyStyle={{ padding: '0' }}
        visible={props.visible}
        width={isMobile ? '100%' : 600}
        footer={
          <div className='flex justify-end bg-white'>
            <Space>
              <Button
                theme='solid'
                onClick={() => formApiRef.current?.submitForm()}
                icon={<IconSave />}
                loading={loading}
              >
                {"提交"}
              </Button>
              <Button
                theme='light'
                type='primary'
                onClick={handleCancel}
                icon={<IconClose />}
              >
                {"取消"}
              </Button>
            </Space>
          </div>
        }
        closeIcon={null}
        onCancel={() => handleCancel()}
      >
        <Spin spinning={loading}>
          <Form
            initValues={getInitValues()}
            getFormApi={(api) => (formApiRef.current = api)}
            onSubmit={submit}
            onSubmitFail={(errs) => {
              const first = Object.values(errs)[0];
              if (first) showError(Array.isArray(first) ? first[0] : first);
              formApiRef.current?.scrollToError();
            }}
          >
            <div className='p-2'>
              <Card className='!rounded-2xl shadow-sm border-0'>
                <div className='flex items-center mb-2'>
                  <Avatar size='small' color='blue' className='mr-2 shadow-md'>
                    <IconUserAdd size={16} />
                  </Avatar>
                  <div>
                    <Text className='text-lg font-medium'>{"用户信息"}</Text>
                    <div className='text-xs text-gray-600'>
                      {"创建新用户账户"}
                    </div>
                  </div>
                </div>

                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Input
                      field='username'
                      label={"用户名"}
                      placeholder={"请输入用户名"}
                      rules={[{ required: true, message: "请输入用户名" }]}
                      showClear
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Input
                      field='display_name'
                      label={"显示名称"}
                      placeholder={"请输入显示名称"}
                      showClear
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Input
                      field='password'
                      label={"密码"}
                      type='password'
                      placeholder={"请输入密码"}
                      rules={[{ required: true, message: "请输入密码" }]}
                      showClear
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Input
                      field='remark'
                      label={"备注"}
                      placeholder={"请输入备注（仅管理员可见）"}
                      showClear
                    />
                  </Col>
                </Row>
              </Card>
            </div>
          </Form>
        </Spin>
      </SideSheet>
    </>
  );
};

export default AddUserModal;
