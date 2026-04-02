import React, { memo } from 'react';
import { Input } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';

const SearchActions = memo(
  ({
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    searchValue = '',
  }) => {
    return (
      <div className='flex items-center gap-2 w-full'>
        <div className='flex-1'>
          <Input
            prefix={<IconSearch />}
            className='model-pricing-search-input'
            size='large'
            placeholder={"模糊搜索模型名称"}
            value={searchValue}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onChange={handleChange}
            showClear
          />
        </div>
      </div>
    );
  },
);

SearchActions.displayName = 'SearchActions';

export default SearchActions;
