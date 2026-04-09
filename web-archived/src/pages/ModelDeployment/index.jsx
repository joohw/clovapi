import React from 'react';
import DeploymentsTable from '../../components/table/model-deployments';
import DeploymentAccessGuard from '../../components/model-deployments/DeploymentAccessGuard';
import { useModelDeploymentSettings } from '../../hooks/model-deployments/useModelDeploymentSettings';

const ModelDeploymentPage = () => {
  const {
    loading,
    isIoNetEnabled,
    connectionLoading,
    connectionOk,
    connectionError,
    testConnection,
  } = useModelDeploymentSettings();

  return (
    <DeploymentAccessGuard
      loading={loading}
      isEnabled={isIoNetEnabled}
      connectionLoading={connectionLoading}
      connectionOk={connectionOk}
      connectionError={connectionError}
      onRetry={() => testConnection()}
    >
      <div className='mt-[60px] px-2'>
        <DeploymentsTable />
      </div>
    </DeploymentAccessGuard>
  );
};

export default ModelDeploymentPage;
