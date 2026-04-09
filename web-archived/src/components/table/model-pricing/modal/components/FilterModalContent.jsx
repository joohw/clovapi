import React from 'react';
import PricingDisplaySettings from '../../filter/PricingDisplaySettings';
import PricingGroups from '../../filter/PricingGroups';
import PricingQuotaTypes from '../../filter/PricingQuotaTypes';
import PricingEndpointTypes from '../../filter/PricingEndpointTypes';
import PricingVendors from '../../filter/PricingVendors';
import PricingTags from '../../filter/PricingTags';
import { usePricingFilterCounts } from '../../../../../hooks/model-pricing/usePricingFilterCounts';

const FilterModalContent = ({ sidebarProps }) => {
  const {
    showWithRecharge,
    setShowWithRecharge,
    currency,
    setCurrency,
    siteDisplayType,
    handleChange,
    setActiveKey,
    showRatio,
    setShowRatio,
    filterGroup,
    setFilterGroup,
    filterQuotaType,
    setFilterQuotaType,
    filterEndpointType,
    setFilterEndpointType,
    filterVendor,
    setFilterVendor,
    filterTag,
    setFilterTag,
    loading,
    ...categoryProps
  } = sidebarProps;

  const {
    quotaTypeModels,
    endpointTypeModels,
    vendorModels,
    tagModels,
    groupCountModels,
  } = usePricingFilterCounts({
    models: categoryProps.models,
    filterGroup,
    filterQuotaType,
    filterEndpointType,
    filterVendor,
    filterTag,
    searchValue: sidebarProps.searchValue,
  });

  return (
    <>
      <PricingDisplaySettings
        showWithRecharge={showWithRecharge}
        setShowWithRecharge={setShowWithRecharge}
        currency={currency}
        setCurrency={setCurrency}
        siteDisplayType={siteDisplayType}
        showRatio={showRatio}
        setShowRatio={setShowRatio}
        loading={loading}
      />

      <PricingVendors
        filterVendor={filterVendor}
        setFilterVendor={setFilterVendor}
        models={vendorModels}
        allModels={categoryProps.models}
        loading={loading}
      />

      <PricingGroups
        filterGroup={filterGroup}
        setFilterGroup={setFilterGroup}
        usableGroup={categoryProps.usableGroup}
        groupRatio={categoryProps.groupRatio}
        models={groupCountModels}
        loading={loading}
      />

      <PricingQuotaTypes
        filterQuotaType={filterQuotaType}
        setFilterQuotaType={setFilterQuotaType}
        models={quotaTypeModels}
        loading={loading}
      />

      <PricingTags
        filterTag={filterTag}
        setFilterTag={setFilterTag}
        models={tagModels}
        allModels={categoryProps.models}
        loading={loading}
      />

      <PricingEndpointTypes
        filterEndpointType={filterEndpointType}
        setFilterEndpointType={setFilterEndpointType}
        models={endpointTypeModels}
        allModels={categoryProps.models}
        loading={loading}
      />
    </>
  );
};

export default FilterModalContent;
