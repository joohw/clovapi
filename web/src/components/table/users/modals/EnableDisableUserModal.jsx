import React from 'react';
import { Modal } from '@douyinfe/semi-ui';

const EnableDisableUserModal = ({
  visible,
  onCancel,
  onConfirm,
  user,
  action,
  t,
}) => {
  const isDisable = action === 'disable';

  return (
    <Modal
      title={isDisable ? "确定要禁用此用户吗？" : "确定要启用此用户吗？"}
      visible={visible}
      onCancel={onCancel}
      onOk={onConfirm}
      type='warning'
    >
      {isDisable ? "此操作将禁用用户账户" : "此操作将启用用户账户"}
    </Modal>
  );
};

export default EnableDisableUserModal;
