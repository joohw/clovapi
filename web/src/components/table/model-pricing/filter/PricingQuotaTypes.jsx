import React from 'react';
import SelectableButtonGroup from '../../../common/ui/SelectableButtonGroup';

/**
 * 计费类型筛选组件
 * @param {string|'all'|0|1} filterQuotaType 当前值
 * @param {Function} setFilterQuotaType setter
 * @param {Array} models 模型列表
 * @param {boolean} loading 是否加载中
 */
const PricingQuotaTypes = ({
  filterQuotaType,
  setFilterQuotaType,
  models = [],
  loading = false,
}) => {
  const qtyCount = (type) =>
    models.filter((m) => (type === 'all' ? true : m.quota_type === type))
      .length;

  const items = [
    { value: 'all', label: "全部类型", tagCount: qtyCount('all') },
    { value: 0, label: "按量计费", tagCount: qtyCount(0) },
    { value: 1, label: "按次计费", tagCount: qtyCount(1) },
  ];

  return (
    <SelectableButtonGroup
      title={"计费类型"}
      items={items}
      activeValue={filterQuotaType}
      onChange={setFilterQuotaType}
      loading={loading}
      variant='amber'
    />
  );
};

export default PricingQuotaTypes;
