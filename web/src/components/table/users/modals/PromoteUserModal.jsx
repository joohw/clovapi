import React from 'react';
import { Modal } from '@douyinfe/semi-ui';

const PromoteUserModal = ({ visible, onCancel, onConfirm, user, t }) => {
  return (
    <Modal
      title={"确定要提升此用户吗？"}
      visible={visible}
      onCancel={onCancel}
      onOk={onConfirm}
      type='warning'
    >
      {"此操作将提升用户的权限级别"}
    </Modal>
  );
};

export default PromoteUserModal;
