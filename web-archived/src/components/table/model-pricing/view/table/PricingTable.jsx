import React, { useMemo } from 'react';
import { Card, Table, Empty } from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { getPricingTableColumns } from './PricingTableColumns';

const PricingTable = ({
  filteredModels,
  loading,
  selectedGroup,
  groupRatio,
  copyText,
  currency,
  siteDisplayType,
  tokenUnit,
  displayPrice,
  searchValue,
  showRatio,
  compactMode = false,
  openModelDetail,
}) => {
  const columns = useMemo(() => {
    return getPricingTableColumns({
      selectedGroup,
      groupRatio,
      copyText,
      currency,
      siteDisplayType,
      tokenUnit,
      displayPrice,
      showRatio,
    });
  }, [
    selectedGroup,
    groupRatio,
    copyText,
    currency,
    siteDisplayType,
    tokenUnit,
    displayPrice,
    showRatio,
  ]);

  // 更新列定义中的 searchValue
  const processedColumns = useMemo(() => {
    const cols = columns.map((column) => {
      if (column.dataIndex === 'model_name') {
        return {
          ...column,
          filteredValue: searchValue ? [searchValue] : [],
        };
      }
      return column;
    });

    // Remove fixed property when in compact mode (mobile view)
    if (compactMode) {
      return cols.map(({ fixed, ...rest }) => rest);
    }
    return cols;
  }, [columns, searchValue, compactMode]);

  const ModelTable = useMemo(
    () => (
      <Card className='!rounded-2xl overflow-hidden border-0 !bg-transparent'>
        <Table
          columns={processedColumns}
          dataSource={filteredModels}
          loading={loading}
          scroll={compactMode ? undefined : { x: 'max-content' }}
          onRow={(record) => ({
            onClick: () => openModelDetail && openModelDetail(record),
            style: { cursor: 'pointer' },
          })}
          empty={
            <Empty
              image={
                <IllustrationNoResult style={{ width: 150, height: 150 }} />
              }
              darkModeImage={
                <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
              }
              description={"搜索无结果"}
              style={{ padding: 30 }}
            />
          }
          pagination={false}
          size='small'
        />
      </Card>
    ),
    [
      filteredModels,
      loading,
      processedColumns,
      openModelDetail,
      compactMode,
    ],
  );

  return ModelTable;
};

export default PricingTable;
