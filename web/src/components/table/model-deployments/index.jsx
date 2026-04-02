import React, { useState } from 'react';
import CardPro from '../../common/ui/CardPro';
import DeploymentsTable from './DeploymentsTable';
import DeploymentsActions from './DeploymentsActions';
import DeploymentsFilters from './DeploymentsFilters';
import EditDeploymentModal from './modals/EditDeploymentModal';
import CreateDeploymentModal from './modals/CreateDeploymentModal';
import ColumnSelectorModal from './modals/ColumnSelectorModal';
import { useDeploymentsData } from '../../../hooks/model-deployments/useDeploymentsData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';

const DeploymentsPage = () => {
  const deploymentsData = useDeploymentsData();
  const isMobile = useIsMobile();

  // Create deployment modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const batchOperationsEnabled = false;

  const {
    // Edit state
    showEdit,
    editingDeployment,
    closeEdit,
    refresh,

    // Actions state
    selectedKeys,
    setSelectedKeys,
    setEditingDeployment,
    setShowEdit,
    batchDeleteDeployments,

    // Filters state
    formInitValues,
    setFormApi,
    searchDeployments,
    loading,
    searching,

    // Column visibility
    showColumnSelector,
    setShowColumnSelector,
    visibleColumns,
    setVisibleColumns,
    COLUMN_KEYS,

    // Description state
    compactMode,
    setCompactMode,
  } = deploymentsData;

  return (
    <>
      {/* Modals */}
      <EditDeploymentModal
        refresh={refresh}
        editingDeployment={editingDeployment}
        visible={showEdit}
        handleClose={closeEdit}
      />

      <CreateDeploymentModal
        visible={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        onSuccess={refresh}
      />

      <ColumnSelectorModal
        visible={showColumnSelector}
        onCancel={() => setShowColumnSelector(false)}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        columnKeys={COLUMN_KEYS}
      />

      {/* Main Content */}
      <CardPro
        type='type3'
        actionsArea={
          <div className='flex flex-col md:flex-row justify-between items-center gap-2 w-full'>
            <DeploymentsActions
              selectedKeys={selectedKeys}
              setSelectedKeys={setSelectedKeys}
              setEditingDeployment={setEditingDeployment}
              setShowEdit={setShowEdit}
              batchDeleteDeployments={batchDeleteDeployments}
              batchOperationsEnabled={batchOperationsEnabled}
              compactMode={compactMode}
              setCompactMode={setCompactMode}
              showCreateModal={showCreateModal}
              setShowCreateModal={setShowCreateModal}
              setShowColumnSelector={setShowColumnSelector}
            />
            <DeploymentsFilters
              formInitValues={formInitValues}
              setFormApi={setFormApi}
              searchDeployments={searchDeployments}
              loading={loading}
              searching={searching}
              setShowColumnSelector={setShowColumnSelector}
            />
          </div>
        }
        paginationArea={createCardProPagination({
          currentPage: deploymentsData.activePage,
          pageSize: deploymentsData.pageSize,
          total: deploymentsData.deploymentCount,
          onPageChange: deploymentsData.handlePageChange,
          onPageSizeChange: deploymentsData.handlePageSizeChange,
          isMobile: isMobile,
        })}
      >
        <DeploymentsTable
          {...deploymentsData}
          batchOperationsEnabled={batchOperationsEnabled}
        />
      </CardPro>
    </>
  );
};

export default DeploymentsPage;
