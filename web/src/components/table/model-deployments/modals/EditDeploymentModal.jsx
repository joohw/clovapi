import React, { useState, useEffect, useRef } from 'react';
import {
  SideSheet,
  Form,
  Button,
  Space,
  Spin,
  Typography,
  Card,
  InputNumber,
  Select,
  Input,
  Row,
  Col,
  Divider,
  Tag,
} from '@douyinfe/semi-ui';
import { Save, X, Server } from 'lucide-react';
import { API, showError, showSuccess } from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const { Text, Title } = Typography;

const EditDeploymentModal = ({
  refresh,
  editingDeployment,
  visible,
  handleClose,
}) => {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const formRef = useRef();

  const isEdit = Boolean(editingDeployment?.id);
  const title = "重命名部署";

  // Resource configuration options
  const cpuOptions = [
    { label: '0.5 Core', value: '0.5' },
    { label: '1 Core', value: '1' },
    { label: '2 Cores', value: '2' },
    { label: '4 Cores', value: '4' },
    { label: '8 Cores', value: '8' },
  ];

  const memoryOptions = [
    { label: '1GB', value: '1Gi' },
    { label: '2GB', value: '2Gi' },
    { label: '4GB', value: '4Gi' },
    { label: '8GB', value: '8Gi' },
    { label: '16GB', value: '16Gi' },
    { label: '32GB', value: '32Gi' },
  ];

  const gpuOptions = [
    { label: "无GPU", value: '' },
    { label: '1 GPU', value: '1' },
    { label: '2 GPUs', value: '2' },
    { label: '4 GPUs', value: '4' },
  ];

  // Load available models
  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const res = await API.get('/api/models/?page_size=1000');
      if (res.data.success) {
        const items = res.data.data.items || res.data.data || [];
        const modelOptions = items.map((model) => ({
          label: `${model.model_name} (${model.vendor?.name || 'Unknown'})`,
          value: model.model_name,
          model_id: model.id,
        }));
        setModels(modelOptions);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      showError("加载模型列表失败");
    }
    setLoadingModels(false);
  };

  // Form submission
  const handleSubmit = async (values) => {
    if (!isEdit || !editingDeployment?.id) {
      showError("无效的部署信息");
      return;
    }

    setLoading(true);
    try {
      // Only handle name update for now
      const res = await API.put(
        `/api/deployments/${editingDeployment.id}/name`,
        {
          name: values.deployment_name,
        },
      );

      if (res.data.success) {
        showSuccess("部署名称更新成功");
        handleClose();
        refresh();
      } else {
        showError(res.data.message || "更新失败");
      }
    } catch (error) {
      console.error('Submit error:', error);
      showError("更新失败，请检查输入信息");
    }
    setLoading(false);
  };

  // Load models when modal opens
  useEffect(() => {
    if (visible) {
      loadModels();
    }
  }, [visible]);

  // Set form values when editing
  useEffect(() => {
    if (formRef.current && editingDeployment && visible && isEdit) {
      formRef.current.setValues({
        deployment_name: editingDeployment.deployment_name || '',
      });
    }
  }, [editingDeployment, visible, isEdit]);

  return (
    <SideSheet
      title={
        <div className='flex items-center gap-2'>
          <Server size={20} />
          <span>{title}</span>
        </div>
      }
      visible={visible}
      onCancel={handleClose}
      width={isMobile ? '100%' : 600}
      bodyStyle={{ padding: 0 }}
      maskClosable={false}
      closeOnEsc={true}
    >
      <div className='p-6 h-full overflow-auto'>
        <Spin spinning={loading} style={{ width: '100%' }}>
          <Form
            ref={formRef}
            onSubmit={handleSubmit}
            labelPosition='top'
            style={{ width: '100%' }}
          >
            <Card>
              <Title heading={5} style={{ marginBottom: 16 }}>
                {"修改部署名称"}
              </Title>

              <Row gutter={16}>
                <Col span={24}>
                  <Form.Input
                    field='deployment_name'
                    label={"部署名称"}
                    placeholder={"请输入新的部署名称"}
                    rules={[
                      { required: true, message: "请输入部署名称" },
                      {
                        pattern: /^[a-zA-Z0-9-_\u4e00-\u9fa5]+$/,
                        message: "部署名称只能包含字母、数字、横线、下划线和中文",
                      },
                    ]}
                  />
                </Col>
              </Row>

              {isEdit && (
                <div className='mt-4 p-3 bg-gray-50 rounded'>
                  <Text type='secondary'>{"部署ID"}: </Text>
                  <Text code>{editingDeployment.id}</Text>
                  <br />
                  <Text type='secondary'>{"当前状态"}: </Text>
                  <Tag
                    color={
                      editingDeployment.status === 'running' ? 'green' : 'grey'
                    }
                  >
                    {editingDeployment.status}
                  </Tag>
                </div>
              )}
            </Card>
          </Form>
        </Spin>
      </div>

      <div className='p-4 border-t border-gray-200 bg-gray-50 flex justify-end'>
        <Space>
          <Button theme='outline' onClick={handleClose} disabled={loading}>
            <X size={16} className='mr-1' />
            {"取消"}
          </Button>
          <Button
            theme='solid'
            type='primary'
            loading={loading}
            onClick={() => formRef.current?.submitForm()}
          >
            <Save size={16} className='mr-1' />
            {isEdit ? "更新" : "创建"}
          </Button>
        </Space>
      </div>
    </SideSheet>
  );
};

export default EditDeploymentModal;
