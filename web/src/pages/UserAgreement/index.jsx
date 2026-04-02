import React from 'react';
import DocumentRenderer from '../../components/common/DocumentRenderer';

const UserAgreement = () => {
  return (
    <DocumentRenderer
      apiEndpoint='/api/user-agreement'
      title={"用户协议"}
      cacheKey='user_agreement'
      emptyMessage={"加载用户协议内容失败..."}
    />
  );
};

export default UserAgreement;
