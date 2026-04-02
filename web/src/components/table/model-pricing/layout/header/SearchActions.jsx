import React, { memo, useCallback } from 'react';
import { Input, Button, Switch, Divider } from '@douyinfe/semi-ui';
import { IconSearch, IconFilter } from '@douyinfe/semi-icons';

const SearchActions = memo(
  ({
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    isMobile = false,
    searchValue = '',
    setShowFilterModal,
    showRatio,
    setShowRatio,
    t,
  }) => {
    const handleFilterClick = useCallback(() => {
      setShowFilterModal?.(true);
    }, [setShowFilterModal]);

    return (
      <div className='flex items-center gap-2 w-full'>
        <div className='flex-1'>
          <Input
            prefix={<IconSearch />}
            placeholder={t('模糊搜索模型名称')}
            value={searchValue}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onChange={handleChange}
            showClear
          />
        </div>

        {!isMobile && (
          <>
            <Divider layout='vertical' margin='8px' />

            {/* 显示倍率开关 */}
            <div className='flex items-center gap-2'>
              <span className='text-sm text-gray-600'>{t('倍率')}</span>
              <Switch checked={showRatio} onChange={setShowRatio} />
            </div>
          </>
        )}

        {isMobile && (
          <Button
            theme='outline'
            type='tertiary'
            icon={<IconFilter />}
            onClick={handleFilterClick}
          >
            {t('筛选')}
          </Button>
        )}
      </div>
    );
  },
);

SearchActions.displayName = 'SearchActions';

export default SearchActions;
