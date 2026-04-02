import React from 'react';
import { Modal } from '@douyinfe/semi-ui';

const ResetPasskeyModal = ({ visible, onCancel, onConfirm, user, t }) => {
  return (
    <Modal
      title={"确认重置 Passkey"}
      visible={visible}
      onCancel={onCancel}
      onOk={onConfirm}
      type='warning'
    >
      {"此操作将解绑用户当前的 Passkey，下次登录需要重新注册。"}{' '}
      {user?.username
        ? `目标用户：${user.username}`
        : ''}
    </Modal>
  );
};

export default ResetPasskeyModal;
