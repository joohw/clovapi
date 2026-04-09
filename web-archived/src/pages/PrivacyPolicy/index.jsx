import React from 'react';
import DocumentRenderer from '../../components/common/DocumentRenderer';

const PrivacyPolicy = () => {
  return (
    <DocumentRenderer
      apiEndpoint='/api/privacy-policy'
      title={"隐私政策"}
      cacheKey='privacy_policy'
      emptyMessage={"加载隐私政策内容失败..."}
    />
  );
};

export default PrivacyPolicy;
