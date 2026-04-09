import React, { useEffect, useState, useRef } from 'react';
import {
  Banner,
  Button,
  Dropdown,
  Form,
  Space,
  Spin,
  RadioGroup,
  Radio,
  Table,
  Modal,
  Input,
  Divider,
} from '@douyinfe/semi-ui';
import {
  IconPlus,
  IconEdit,
  IconDelete,
  IconSearch,
  IconSaveStroked,
  IconBolt,
} from '@douyinfe/semi-icons';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
  verifyJSON,
} from '../../../helpers';
export default function SettingsChats(props) {
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    Chats: '[]',
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);
  const [editMode, setEditMode] = useState('visual');
  const [chatConfigs, setChatConfigs] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [isEdit, setIsEdit] = useState(false);
  const [searchText, setSearchText] = useState('');
  const modalFormRef = useRef();

  const BUILTIN_TEMPLATES = [
    { name: 'Cherry Studio', url: 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}' },
    { name: 'AionUI', url: 'aionui://provider/add?v=1&data={aionuiConfig}' },
    { name: '流畅阅读', url: 'fluentread' },
    { name: 'CC Switch', url: 'ccswitch' },
    { name: 'Lobe Chat', url: 'https://chat-preview.lobehub.com/?settings={"keyVaults":{"openai":{"apiKey":"{key}","baseURL":"{address}/v1"}}}' },
    { name: 'AI as Workspace', url: 'https://aiaw.app/set-provider?provider={"type":"openai","settings":{"apiKey":"{key}","baseURL":"{address}/v1","compatibility":"strict"}}' },
    { name: 'AMA 问天', url: 'ama://set-api-key?server={address}&key={key}' },
    { name: 'OpenCat', url: 'opencat://team/join?domain={address}&token={key}' },
  ];

  const addTemplates = (templates) => {
    const existingNames = new Set(chatConfigs.map((c) => c.name));
    const toAdd = templates.filter((tpl) => !existingNames.has(tpl.name));
    if (toAdd.length === 0) {
      showWarning("所选模板已存在");
      return;
    }
    let maxId = chatConfigs.length > 0
      ? Math.max(...chatConfigs.map((c) => c.id))
      : -1;
    const newItems = toAdd.map((tpl) => ({
      id: ++maxId,
      name: tpl.name,
      url: tpl.url,
    }));
    const newConfigs = [...chatConfigs, ...newItems];
    setChatConfigs(newConfigs);
    syncConfigsToJson(newConfigs);
    showSuccess(`已添加 ${toAdd.length} 个模板`);
  };

  const jsonToConfigs = (jsonString) => {
    try {
      const configs = JSON.parse(jsonString);
      return Array.isArray(configs)
        ? configs.map((config, index) => ({
            id: index,
            name: Object.keys(config)[0] || '',
            url: Object.values(config)[0] || '',
          }))
        : [];
    } catch (error) {
      console.error('JSON parse error:', error);
      return [];
    }
  };

  const configsToJson = (configs) => {
    const jsonArray = configs.map((config) => ({
      [config.name]: config.url,
    }));
    return JSON.stringify(jsonArray, null, 2);
  };

  const syncJsonToConfigs = () => {
    const configs = jsonToConfigs(inputs.Chats);
    setChatConfigs(configs);
  };

  const syncConfigsToJson = (configs) => {
    const jsonString = configsToJson(configs);
    setInputs((prev) => ({
      ...prev,
      Chats: jsonString,
    }));
    if (refForm.current && editMode === 'json') {
      refForm.current.setValues({ Chats: jsonString });
    }
  };

  async function onSubmit() {
    try {
      if (editMode === 'json' && refForm.current) {
        try {
          await refForm.current.validate();
        } catch (error) {
          console.error('Validation failed:', error);
          showError("请检查输入");
          return;
        }
      }

      const updateArray = compareObjects(inputs, inputsRow);
      if (!updateArray.length)
        return showWarning("你似乎并没有修改什么");
      const requestQueue = updateArray.map((item) => {
        let value = '';
        if (typeof inputs[item.key] === 'boolean') {
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
      try {
        const res = await Promise.all(requestQueue);
        if (res.includes(undefined)) {
          if (requestQueue.length > 1) {
            showError("部分保存失败，请重试");
          }
          return;
        }
        showSuccess("保存成功");
        props.refresh();
      } catch {
        showError("保存失败，请重试");
      } finally {
        setLoading(false);
      }
    } catch (error) {
      showError("请检查输入");
      console.error(error);
    }
  }

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        if (key === 'Chats') {
          const obj = JSON.parse(props.options[key]);
          currentInputs[key] = JSON.stringify(obj, null, 2);
        } else {
          currentInputs[key] = props.options[key];
        }
      }
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    if (refForm.current) {
      refForm.current.setValues(currentInputs);
    }

    // 同步到可视化配置
    const configs = jsonToConfigs(currentInputs.Chats || '[]');
    setChatConfigs(configs);
  }, [props.options]);

  useEffect(() => {
    if (editMode === 'visual') {
      syncJsonToConfigs();
    }
  }, [inputs.Chats, editMode]);

  useEffect(() => {
    if (refForm.current && editMode === 'json') {
      refForm.current.setValues(inputs);
    }
  }, [editMode, inputs]);

  const handleAddConfig = () => {
    setEditingConfig({ name: '', url: '' });
    setIsEdit(false);
    setModalVisible(true);
    setTimeout(() => {
      if (modalFormRef.current) {
        modalFormRef.current.setValues({ name: '', url: '' });
      }
    }, 100);
  };

  const handleEditConfig = (config) => {
    setEditingConfig({ ...config });
    setIsEdit(true);
    setModalVisible(true);
    setTimeout(() => {
      if (modalFormRef.current) {
        modalFormRef.current.setValues(config);
      }
    }, 100);
  };

  const handleDeleteConfig = (id) => {
    const newConfigs = chatConfigs.filter((config) => config.id !== id);
    setChatConfigs(newConfigs);
    syncConfigsToJson(newConfigs);
    showSuccess("删除成功");
  };

  const handleModalOk = () => {
    if (modalFormRef.current) {
      modalFormRef.current
        .validate()
        .then((values) => {
          // 检查名称是否重复
          const isDuplicate = chatConfigs.some(
            (config) =>
              config.name === values.name &&
              (!isEdit || config.id !== editingConfig.id),
          );

          if (isDuplicate) {
            showError("聊天应用名称已存在，请使用其他名称");
            return;
          }

          if (isEdit) {
            const newConfigs = chatConfigs.map((config) =>
              config.id === editingConfig.id
                ? { ...editingConfig, name: values.name, url: values.url }
                : config,
            );
            setChatConfigs(newConfigs);
            syncConfigsToJson(newConfigs);
          } else {
            const maxId =
              chatConfigs.length > 0
                ? Math.max(...chatConfigs.map((c) => c.id))
                : -1;
            const newConfig = {
              id: maxId + 1,
              name: values.name,
              url: values.url,
            };
            const newConfigs = [...chatConfigs, newConfig];
            setChatConfigs(newConfigs);
            syncConfigsToJson(newConfigs);
          }
          setModalVisible(false);
          setEditingConfig(null);
          showSuccess(isEdit ? "编辑成功" : "添加成功");
        })
        .catch((error) => {
          console.error('Modal form validation error:', error);
        });
    }
  };

  const handleModalCancel = () => {
    setModalVisible(false);
    setEditingConfig(null);
  };

  const filteredConfigs = chatConfigs.filter(
    (config) =>
      !searchText ||
      config.name.toLowerCase().includes(searchText.toLowerCase()),
  );

  const highlightKeywords = (text) => {
    if (!text) return text;

    const parts = text.split(/(\{address\}|\{key\})/g);
    return parts.map((part, index) => {
      if (part === '{address}') {
        return (
          <span key={index} style={{ color: '#0077cc', fontWeight: 600 }}>
            {part}
          </span>
        );
      } else if (part === '{key}') {
        return (
          <span key={index} style={{ color: '#ff6b35', fontWeight: 600 }}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const columns = [
    {
      title: "聊天应用名称",
      dataIndex: 'name',
      key: 'name',
      render: (text) => text || "未命名",
    },
    {
      title: "URL链接",
      dataIndex: 'url',
      key: 'url',
      render: (text) => (
        <div style={{ maxWidth: 300, wordBreak: 'break-all' }}>
          {highlightKeywords(text)}
        </div>
      ),
    },
    {
      title: "操作",
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            type='primary'
            icon={<IconEdit />}
            size='small'
            onClick={() => handleEditConfig(record)}
          >
            {"编辑"}
          </Button>
          <Button
            type='danger'
            icon={<IconDelete />}
            size='small'
            onClick={() => handleDeleteConfig(record.id)}
          >
            {"删除"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space vertical style={{ width: '100%' }}>
        <Form.Section text={"聊天设置"}>
          <Banner
            type='info'
            description={"链接中的{key}将自动替换为sk-xxxx，{address}将自动替换为系统设置的服务器地址，末尾不带/和/v1"}
          />

          <Divider />

          <div style={{ marginBottom: 16 }}>
            <span style={{ marginRight: 16, fontWeight: 600 }}>
              {"编辑模式"}:
            </span>
            <RadioGroup
              type='button'
              value={editMode}
              onChange={(e) => {
                const newMode = e.target.value;
                setEditMode(newMode);

                // 确保模式切换时数据正确同步
                setTimeout(() => {
                  if (newMode === 'json' && refForm.current) {
                    refForm.current.setValues(inputs);
                  }
                }, 100);
              }}
            >
              <Radio value='visual'>{"可视化编辑"}</Radio>
              <Radio value='json'>{"JSON编辑"}</Radio>
            </RadioGroup>
          </div>

          {editMode === 'visual' ? (
            <div>
              <Space style={{ marginBottom: 16 }}>
                <Button
                  type='primary'
                  icon={<IconPlus />}
                  onClick={handleAddConfig}
                >
                  {"添加聊天配置"}
                </Button>
                <Dropdown
                  trigger='click'
                  position='bottomLeft'
                  menu={[
                    ...BUILTIN_TEMPLATES.map((tpl, idx) => ({
                      node: 'item',
                      key: String(idx),
                      name: tpl.name,
                      onClick: () => addTemplates([tpl]),
                    })),
                    { node: 'divider', key: 'divider' },
                    {
                      node: 'item',
                      key: 'all',
                      name: "全部填入",
                      onClick: () => addTemplates(BUILTIN_TEMPLATES),
                    },
                  ]}
                >
                  <Button icon={<IconBolt />}>
                    {"填入模板"}
                  </Button>
                </Dropdown>
                <Button
                  type='primary'
                  theme='solid'
                  icon={<IconSaveStroked />}
                  onClick={onSubmit}
                >
                  {"保存聊天设置"}
                </Button>
                <Input
                  prefix={<IconSearch />}
                  placeholder={"搜索聊天应用名称"}
                  value={searchText}
                  onChange={(value) => setSearchText(value)}
                  style={{ width: 250 }}
                  showClear
                />
              </Space>

              <Table
                columns={columns}
                dataSource={filteredConfigs}
                rowKey='id'
                pagination={{
                  pageSize: 10,
                  showSizeChanger: false,
                  showQuickJumper: true,
                  showTotal: (total, range) =>
                    "共 {{total}} 项，当前显示 {{start}}-{{end}} 项",
                }}
              />
            </div>
          ) : (
            <Form
              values={inputs}
              getFormApi={(formAPI) => (refForm.current = formAPI)}
            >
              <Form.TextArea
                label={"聊天配置"}
                extraText={''}
                placeholder={"为一个 JSON 文本"}
                field={'Chats'}
                autosize={{ minRows: 6, maxRows: 12 }}
                trigger='blur'
                stopValidateWithError
                rules={[
                  {
                    validator: (rule, value) => {
                      return verifyJSON(value);
                    },
                    message: "不是合法的 JSON 字符串",
                  },
                ]}
                onChange={(value) =>
                  setInputs({
                    ...inputs,
                    Chats: value,
                  })
                }
              />
            </Form>
          )}
        </Form.Section>

        {editMode === 'json' && (
          <Space>
            <Button
              type='primary'
              icon={<IconSaveStroked />}
              onClick={onSubmit}
            >
              {"保存聊天设置"}
            </Button>
          </Space>
        )}
      </Space>

      <Modal
        title={isEdit ? "编辑聊天配置" : "添加聊天配置"}
        visible={modalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={600}
      >
        <Form getFormApi={(api) => (modalFormRef.current = api)}>
          <Form.Input
            field='name'
            label={"聊天应用名称"}
            placeholder={"请输入聊天应用名称"}
            rules={[
              { required: true, message: "请输入聊天应用名称" },
              { min: 1, message: "名称不能为空" },
            ]}
          />
          <Form.Input
            field='url'
            label={"URL链接"}
            placeholder={"请输入完整的URL链接"}
            rules={[{ required: true, message: "请输入URL链接" }]}
          />
          <Banner
            type='info'
            description={"提示：链接中的{key}将被替换为API密钥，{address}将被替换为服务器地址"}
            style={{ marginTop: 16 }}
          />
        </Form>
      </Modal>
    </Spin>
  );
}
