import React, { useState, memo } from 'react';
import PricingFilterModal from '../../modal/PricingFilterModal';
import SearchActions from './SearchActions';

const PricingTopSection = memo(
  ({
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    isMobile,
    sidebarProps,
    searchValue,
    showWithRecharge,
    setShowWithRecharge,
    currency,
    setCurrency,
    siteDisplayType,
    showRatio,
    setShowRatio,
    t,
  }) => {
    const [showFilterModal, setShowFilterModal] = useState(false);

    return (
      <>
        <div className='w-full'>
          <SearchActions
            handleChange={handleChange}
            handleCompositionStart={handleCompositionStart}
            handleCompositionEnd={handleCompositionEnd}
            isMobile={isMobile}
            searchValue={searchValue}
            setShowFilterModal={setShowFilterModal}
            showWithRecharge={showWithRecharge}
            setShowWithRecharge={setShowWithRecharge}
            currency={currency}
            setCurrency={setCurrency}
            siteDisplayType={siteDisplayType}
            showRatio={showRatio}
            setShowRatio={setShowRatio}
            t={t}
          />
        </div>
        <PricingFilterModal
          visible={showFilterModal}
          onClose={() => setShowFilterModal(false)}
          sidebarProps={sidebarProps}
          t={t}
        />
      </>
    );
  },
);

PricingTopSection.displayName = 'PricingTopSection';

export default PricingTopSection;
