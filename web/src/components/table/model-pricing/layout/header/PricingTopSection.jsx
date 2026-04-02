import React, { memo } from 'react';
import SearchActions from './SearchActions';

const PricingTopSection = memo(
  ({
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    searchValue,
  }) => {
    return (
      <div className='w-full'>
        <SearchActions
          handleChange={handleChange}
          handleCompositionStart={handleCompositionStart}
          handleCompositionEnd={handleCompositionEnd}
          searchValue={searchValue}
        />
      </div>
    );
  },
);

PricingTopSection.displayName = 'PricingTopSection';

export default PricingTopSection;
