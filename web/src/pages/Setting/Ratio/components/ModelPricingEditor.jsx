import React, { useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  Modal,
  Radio,
  RadioGroup,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconDelete,
  IconPlus,
  IconSave,
  IconSearch,
} from '@douyinfe/semi-icons';
import {
  PAGE_SIZE,
  PRICE_SUFFIX,
  buildSummaryText,
  hasValue,
  useModelPricingEditorState,
} from '../hooks/useModelPricingEditorState';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const { Text } = Typography;
const EMPTY_CANDIDATE_MODEL_NAMES = [];
const EMPTY_CANDIDATE_MODEL_DETAILS = [];

const PriceInput = ({
  label,
  value,
  placeholder,
  onChange,
  suffix = PRICE_SUFFIX,
  disabled = false,
  extraText = '',
  headerAction = null,
  hidden = false,
}) => (
  <div style={{ marginBottom: 16 }}>
    <div className='mb-1 font-medium text-gray-700 flex items-center justify-between gap-3'>
      <span>{label}</span>
      {headerAction}
    </div>
    {!hidden ? (
      <Input
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        suffix={suffix}
        disabled={disabled}
      />
    ) : null}
    {extraText ? (
      <div className='mt-1 text-xs text-gray-500'>{extraText}</div>
    ) : null}
  </div>
);

export default function ModelPricingEditor({
  options,
  refresh,
  candidateModelNames = EMPTY_CANDIDATE_MODEL_NAMES,
  candidateModelDetails = EMPTY_CANDIDATE_MODEL_DETAILS,
  filterMode = 'all',
  allowAddModel = true,
  allowDeleteModel = true,
  showConflictFilter = true,
  listDescription = '',
  emptyTitle = '',
  emptyDescription = '',
}) {
  const isMobile = useIsMobile();
  const [addVisible, setAddVisible] = useState(false);
  const [batchVisible, setBatchVisible] = useState(false);
  const [newModelName, setNewModelName] = useState('');

  const {
    selectedModel,
    selectedModelName,
    selectedModelNames,
    setSelectedModelName,
    setSelectedModelNames,
    searchText,
    setSearchText,
    currentPage,
    setCurrentPage,
    loading,
    conflictOnly,
    setConflictOnly,
    filteredModels,
    pagedData,
    selectedWarnings,
    previewRows,
    isOptionalFieldEnabled,
    handleOptionalFieldToggle,
    handleNumericFieldChange,
    handleBillingModeChange,
    handleSubmit,
    addModel,
    deleteModel,
    applySelectedModelPricing,
  } = useModelPricingEditorState({
    options,
    refresh,
    t,
    candidateModelNames,
    candidateModelDetails,
    filterMode,
  });

  const columns = useMemo(
    () => [
      {
        title: "模型名称",
        dataIndex: 'name',
        key: 'name',
        render: (text, record) => (
          <Space>
            <Button
              theme='borderless'
              type='tertiary'
              onClick={() => setSelectedModelName(record.name)}
              style={{
                padding: 0,
                color:
                  record.name === selectedModelName
                    ? 'var(--semi-color-primary)'
                    : undefined,
              }}
            >
              {text}
            </Button>
            {selectedModelNames.includes(record.name) ? (
              <Tag color='green' shape='circle'>
                {"已勾选"}
              </Tag>
            ) : null}
            {record.hasConflict ? (
              <Tag color='red' shape='circle'>
                {"矛盾"}
              </Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: "状态",
        dataIndex: 'status',
        key: 'status',
        render: (_, record) => {
          if (typeof record.status !== 'number') {
            return '-';
          }
          return record.status === 1 ? (
            <Tag color='green'>{"启用"}</Tag>
          ) : (
            <Tag color='red'>{"禁用"}</Tag>
          );
        },
      },
      {
        title: "倍率",
        dataIndex: 'ratio',
        key: 'ratio',
        render: (_, record) => {
          if (record.billingMode === 'per-request') {
            return '-';
          }
          const ratioValue = hasValue(record.inputPrice)
            ? Number(record.inputPrice) / 2
            : hasValue(record.rawRatios?.modelRatio)
              ? Number(record.rawRatios.modelRatio)
              : null;
          return ratioValue !== null && Number.isFinite(ratioValue)
            ? `${parseFloat(ratioValue.toFixed(12))}x`
            : "未设置";
        },
      },
      {
        title: "计费类型",
        dataIndex: 'billingMode',
        key: 'billingMode',
        render: (_, record) => (
          <Tag color={record.billingMode === 'per-request' ? 'teal' : 'violet'}>
            {record.billingMode === 'per-request'
              ? "按次计费"
              : "按量计费"}
          </Tag>
        ),
      },
      {
        title: "价格摘要",
        dataIndex: 'summary',
        key: 'summary',
        render: (_, record) => buildSummaryText(record, t),
      },
      {
        title: "分组",
        dataIndex: 'enableGroups',
        key: 'enableGroups',
        render: (_, record) =>
          Array.isArray(record.enableGroups) && record.enableGroups.length > 0
            ? record.enableGroups.join(', ')
            : '-',
      },
      {
        title: "端点",
        dataIndex: 'supportedEndpointTypes',
        key: 'supportedEndpointTypes',
        render: (_, record) =>
          Array.isArray(record.supportedEndpointTypes) &&
          record.supportedEndpointTypes.length > 0
            ? record.supportedEndpointTypes.join(', ')
            : '-',
      },
      {
        title: "描述",
        dataIndex: 'description',
        key: 'description',
        render: (_, record) => record.description || '-',
      },
      {
        title: "标签",
        dataIndex: 'tags',
        key: 'tags',
        render: (_, record) => record.tags || '-',
      },
      {
        title: "操作",
        key: 'action',
        render: (_, record) => (
          <Space>
            {allowDeleteModel ? (
              <Button
                size='small'
                type='danger'
                icon={<IconDelete />}
                onClick={() => deleteModel(record.name)}
              />
            ) : null}
          </Space>
        ),
      },
    ],
    [
      allowDeleteModel,
      deleteModel,
      selectedModelName,
      selectedModelNames,
      setSelectedModelName,
      t,
    ],
  );

  const handleAddModel = () => {
    if (addModel(newModelName)) {
      setNewModelName('');
      setAddVisible(false);
    }
  };

  const rowSelection = {
    selectedRowKeys: selectedModelNames,
    onChange: (selectedRowKeys) => setSelectedModelNames(selectedRowKeys),
  };

  return (
    <>
      <Space vertical align='start' style={{ width: '100%' }}>
        <Space wrap className='mt-2'>
          {allowAddModel ? (
            <Button
              icon={<IconPlus />}
              onClick={() => setAddVisible(true)}
              style={isMobile ? { width: '100%' } : undefined}
            >
              {"添加模型"}
            </Button>
          ) : null}
          <Button
            type='primary'
            icon={<IconSave />}
            loading={loading}
            onClick={handleSubmit}
            style={isMobile ? { width: '100%' } : undefined}
          >
            {"应用更改"}
          </Button>
          <Button
            disabled={!selectedModel || selectedModelNames.length === 0}
            onClick={() => setBatchVisible(true)}
            style={isMobile ? { width: '100%' } : undefined}
          >
            {"批量应用当前模型价格"}
            {selectedModelNames.length > 0 ? ` (${selectedModelNames.length})` : ''}
          </Button>
          <Input
            prefix={<IconSearch />}
            placeholder={"搜索模型名称/描述/标签/分组/端点"}
            value={searchText}
            onChange={(value) => setSearchText(value)}
            className='model-pricing-search-input'
            style={{ width: isMobile ? '100%' : 220 }}
            showClear
          />
          {showConflictFilter ? (
            <Checkbox
              checked={conflictOnly}
              onChange={(event) => setConflictOnly(event.target.checked)}
            >
              {"仅显示矛盾倍率"}
            </Checkbox>
          ) : null}
        </Space>

        {listDescription ? (
          <div className='text-sm text-gray-500'>{listDescription}</div>
        ) : null}
        {selectedModelNames.length > 0 ? (
          <div
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--semi-color-primary-light-default)',
              border: '1px solid var(--semi-color-primary)',
              color: 'var(--semi-color-primary)',
              fontWeight: 600,
            }}
          >
            {`已勾选 ${selectedModelNames.length} 个模型`}
          </div>
        ) : null}

        <div
          style={{
            width: '100%',
            display: 'grid',
            gap: 16,
            gridTemplateColumns: isMobile
              ? 'minmax(0, 1fr)'
              : 'minmax(360px, 1.1fr) minmax(420px, 1fr)',
          }}
        >
          <Card
            bodyStyle={{ padding: 0 }}
            style={isMobile ? { order: 2 } : undefined}
          >
            <div style={{ overflowX: 'auto' }}>
              <Table
                columns={columns}
                dataSource={pagedData}
                rowKey='name'
                rowSelection={rowSelection}
                pagination={{
                  currentPage,
                  pageSize: PAGE_SIZE,
                  total: filteredModels.length,
                  onPageChange: (page) => setCurrentPage(page),
                  showTotal: true,
                  showSizeChanger: false,
                }}
                empty={
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    {emptyTitle || "暂无模型"}
                  </div>
                }
                onRow={(record) => ({
                  style: {
                    background: selectedModelNames.includes(record.name)
                      ? 'var(--semi-color-success-light-default)'
                      : record.name === selectedModelName
                        ? 'var(--semi-color-primary-light-default)'
                        : undefined,
                    boxShadow: selectedModelNames.includes(record.name)
                      ? 'inset 4px 0 0 var(--semi-color-success)'
                      : record.name === selectedModelName
                        ? 'inset 4px 0 0 var(--semi-color-primary)'
                        : undefined,
                    transition: 'background 0.2s ease, box-shadow 0.2s ease',
                  },
                  onClick: () => setSelectedModelName(record.name),
                })}
                scroll={{ x: 'max-content' }}
              />
            </div>
          </Card>

          <Card
            style={isMobile ? { order: 1 } : undefined}
            title={selectedModel ? selectedModel.name : "模型计费编辑器"}
            headerExtraContent={
              selectedModel ? (
                <Tag color='blue'>
                  {selectedModel.billingMode === 'per-request'
                    ? "按次计费"
                    : "按量计费"}
                </Tag>
              ) : null
            }
          >
            {!selectedModel ? (
              <Empty
                title={emptyTitle || "暂无模型"}
                description={
                  emptyDescription || "请先新增模型或从左侧列表选择一个模型"
                }
              />
            ) : (
              <div>
                <div className='mb-4'>
                  <div className='mb-2 font-medium text-gray-700'>
                    {"计费方式"}
                  </div>
                  <RadioGroup
                    type='button'
                    value={selectedModel.billingMode}
                    onChange={(event) => handleBillingModeChange(event.target.value)}
                  >
                    <Radio value='per-token'>{"按量计费"}</Radio>
                    <Radio value='per-request'>{"按次计费"}</Radio>
                  </RadioGroup>
                  <div className='mt-2 text-xs text-gray-500'>
                    {"这个界面默认按价格填写，保存时会自动换算回后端需要的倍率 JSON。"}
                  </div>
                </div>

                {selectedWarnings.length > 0 ? (
                  <Card
                    bodyStyle={{ padding: 12 }}
                    style={{
                      marginBottom: 16,
                      background: 'var(--semi-color-warning-light-default)',
                    }}
                  >
                    <div className='font-medium mb-2'>{"当前提示"}</div>
                    {selectedWarnings.map((warning) => (
                      <div key={warning} className='text-sm text-gray-700 mb-1'>
                        {warning}
                      </div>
                    ))}
                  </Card>
                ) : null}

                {selectedModel.billingMode === 'per-request' ? (
                  <PriceInput
                    label={"固定价格"}
                    value={selectedModel.fixedPrice}
                    placeholder={"输入每次调用价格"}
                    suffix={"$/次"}
                    onChange={(value) => handleNumericFieldChange('fixedPrice', value)}
                    extraText={"适合 MJ / 任务类等按次收费模型。"}
                  />
                ) : (
                  <>
                    <Card
                      bodyStyle={{ padding: 16 }}
                      style={{
                        marginBottom: 16,
                        background: 'var(--semi-color-fill-0)',
                      }}
                    >
                      <div className='font-medium mb-3'>{"基础价格"}</div>
                      <PriceInput
                        label={"输入价格"}
                        value={selectedModel.inputPrice}
                        placeholder={"输入 $/1M tokens"}
                        onChange={(value) => handleNumericFieldChange('inputPrice', value)}
                      />
                      {selectedModel.completionRatioLocked ? (
                        <Banner
                          type='warning'
                          bordered
                          fullMode={false}
                          closeIcon={null}
                          style={{ marginBottom: 12 }}
                          title={"补全价格已锁定"}
                          description={`该模型补全倍率由后端固定为 ${selectedModel.lockedCompletionRatio || '-'}。补全价格不能在这里修改。`}
                        />
                      ) : null}
                      <PriceInput
                        label={"补全价格"}
                        value={selectedModel.completionPrice}
                        placeholder={"输入 $/1M tokens"}
                        onChange={(value) =>
                          handleNumericFieldChange('completionPrice', value)
                        }
                        headerAction={
                          <Switch
                            size='small'
                            checked={isOptionalFieldEnabled(
                              selectedModel,
                              'completionPrice',
                            )}
                            disabled={selectedModel.completionRatioLocked}
                            onChange={(checked) =>
                              handleOptionalFieldToggle('completionPrice', checked)
                            }
                          />
                        }
                        hidden={
                          !isOptionalFieldEnabled(selectedModel, 'completionPrice')
                        }
                        disabled={
                          !hasValue(selectedModel.inputPrice) ||
                          selectedModel.completionRatioLocked
                        }
                        extraText={
                          selectedModel.completionRatioLocked
                            ? `后端固定倍率：${selectedModel.lockedCompletionRatio || '-'}。该字段仅展示换算后的价格。`
                            : !isOptionalFieldEnabled(
                                  selectedModel,
                                  'completionPrice',
                                )
                              ? "当前未启用，需要时再打开即可。"
                              : ''
                        }
                      />
                      <PriceInput
                        label={"缓存读取价格"}
                        value={selectedModel.cachePrice}
                        placeholder={"输入 $/1M tokens"}
                        onChange={(value) => handleNumericFieldChange('cachePrice', value)}
                        headerAction={
                          <Switch
                            size='small'
                            checked={isOptionalFieldEnabled(selectedModel, 'cachePrice')}
                            onChange={(checked) =>
                              handleOptionalFieldToggle('cachePrice', checked)
                            }
                          />
                        }
                        hidden={!isOptionalFieldEnabled(selectedModel, 'cachePrice')}
                        disabled={!hasValue(selectedModel.inputPrice)}
                        extraText={
                          !isOptionalFieldEnabled(selectedModel, 'cachePrice')
                            ? "当前未启用，需要时再打开即可。"
                            : ''
                        }
                      />
                      <PriceInput
                        label={"缓存创建价格"}
                        value={selectedModel.createCachePrice}
                        placeholder={"输入 $/1M tokens"}
                        onChange={(value) =>
                          handleNumericFieldChange('createCachePrice', value)
                        }
                        headerAction={
                          <Switch
                            size='small'
                            checked={isOptionalFieldEnabled(
                              selectedModel,
                              'createCachePrice',
                            )}
                            onChange={(checked) =>
                              handleOptionalFieldToggle('createCachePrice', checked)
                            }
                          />
                        }
                        hidden={
                          !isOptionalFieldEnabled(selectedModel, 'createCachePrice')
                        }
                        disabled={!hasValue(selectedModel.inputPrice)}
                        extraText={
                          !isOptionalFieldEnabled(
                            selectedModel,
                            'createCachePrice',
                          )
                            ? "当前未启用，需要时再打开即可。"
                            : ''
                        }
                      />
                    </Card>

                    <Card
                      bodyStyle={{ padding: 16 }}
                      style={{
                        marginBottom: 16,
                        background: 'var(--semi-color-fill-0)',
                      }}
                    >
                      <div className='mb-3'>
                        <div className='font-medium'>{"扩展价格"}</div>
                        <div className='text-xs text-gray-500 mt-1'>
                          {"这些价格都是可选项，不填也可以。"}
                        </div>
                      </div>
                      <PriceInput
                        label={"图片输入价格"}
                        value={selectedModel.imagePrice}
                        placeholder={"输入 $/1M tokens"}
                        onChange={(value) => handleNumericFieldChange('imagePrice', value)}
                        headerAction={
                          <Switch
                            size='small'
                            checked={isOptionalFieldEnabled(selectedModel, 'imagePrice')}
                            onChange={(checked) =>
                              handleOptionalFieldToggle('imagePrice', checked)
                            }
                          />
                        }
                        hidden={!isOptionalFieldEnabled(selectedModel, 'imagePrice')}
                        disabled={!hasValue(selectedModel.inputPrice)}
                        extraText={
                          !isOptionalFieldEnabled(selectedModel, 'imagePrice')
                            ? "当前未启用，需要时再打开即可。"
                            : ''
                        }
                      />
                      <PriceInput
                        label={"音频输入价格"}
                        value={selectedModel.audioInputPrice}
                        placeholder={"输入 $/1M tokens"}
                        onChange={(value) =>
                          handleNumericFieldChange('audioInputPrice', value)
                        }
                        headerAction={
                          <Switch
                            size='small'
                            checked={isOptionalFieldEnabled(
                              selectedModel,
                              'audioInputPrice',
                            )}
                            onChange={(checked) =>
                              handleOptionalFieldToggle('audioInputPrice', checked)
                            }
                          />
                        }
                        hidden={!isOptionalFieldEnabled(selectedModel, 'audioInputPrice')}
                        disabled={!hasValue(selectedModel.inputPrice)}
                        extraText={
                          !isOptionalFieldEnabled(
                            selectedModel,
                            'audioInputPrice',
                          )
                            ? "当前未启用，需要时再打开即可。"
                            : ''
                        }
                      />
                      <PriceInput
                        label={"音频补全价格"}
                        value={selectedModel.audioOutputPrice}
                        placeholder={"输入 $/1M tokens"}
                        onChange={(value) =>
                          handleNumericFieldChange('audioOutputPrice', value)
                        }
                        headerAction={
                          <Switch
                            size='small'
                            checked={isOptionalFieldEnabled(
                              selectedModel,
                              'audioOutputPrice',
                            )}
                            disabled={!isOptionalFieldEnabled(
                              selectedModel,
                              'audioInputPrice',
                            )}
                            onChange={(checked) =>
                              handleOptionalFieldToggle('audioOutputPrice', checked)
                            }
                          />
                        }
                        hidden={
                          !isOptionalFieldEnabled(selectedModel, 'audioOutputPrice')
                        }
                        disabled={!hasValue(selectedModel.audioInputPrice)}
                        extraText={
                          !isOptionalFieldEnabled(
                            selectedModel,
                            'audioInputPrice',
                          )
                            ? "请先开启并填写音频输入价格。"
                            : !isOptionalFieldEnabled(
                                  selectedModel,
                                  'audioOutputPrice',
                                )
                              ? "当前未启用，需要时再打开即可。"
                              : ''
                        }
                      />
                    </Card>
                  </>
                )}

                <Card
                  bodyStyle={{ padding: 16 }}
                  style={{ background: 'var(--semi-color-fill-0)' }}
                >
                  <div className='font-medium mb-3'>{"保存预览"}</div>
                  <div className='text-xs text-gray-500 mb-3'>
                    {"下面展示这个模型保存后会写入哪些后端字段，便于和原始 JSON 编辑框保持一致。"}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(140px, 180px) 1fr',
                      gap: 8,
                    }}
                  >
                    {previewRows.map((row) => (
                      <React.Fragment key={row.key}>
                        <Text strong>{row.label}</Text>
                        <Text>{row.value}</Text>
                      </React.Fragment>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </Card>
        </div>
      </Space>

      {allowAddModel ? (
        <Modal
          title={"添加模型"}
          visible={addVisible}
          onCancel={() => {
            setAddVisible(false);
            setNewModelName('');
          }}
          onOk={handleAddModel}
        >
          <Input
            value={newModelName}
            placeholder={"输入模型名称，例如 gpt-4.1"}
            onChange={(value) => setNewModelName(value)}
          />
        </Modal>
      ) : null}

      <Modal
        title={"批量应用当前模型价格"}
        visible={batchVisible}
        onCancel={() => setBatchVisible(false)}
        onOk={() => {
          if (applySelectedModelPricing()) {
            setBatchVisible(false);
          }
        }}
      >
        <div className='text-sm text-gray-600'>
          {selectedModel
            ? `将把当前编辑中的模型 ${selectedModel.name} 的价格配置，批量应用到已勾选的 ${selectedModelNames.length} 个模型。`
            : "请先选择一个作为模板的模型"}
        </div>
        {selectedModel ? (
          <div className='text-xs text-gray-500 mt-3'>
            {"适合同系列模型一起定价，例如把 gpt-5.1 的价格批量同步到 gpt-5.1-high、gpt-5.1-low 等模型。"}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
