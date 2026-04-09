import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Bell } from 'lucide-react';

const NotificationButton = ({ onNoticeOpen }) => {
  const buttonProps = {
    icon: <Bell size={18} />,
    'aria-label': "系统公告",
    onClick: onNoticeOpen,
    theme: 'borderless',
    type: 'tertiary',
    className:
      '!p-1.5 !text-current focus:!bg-semi-color-fill-1 dark:focus:!bg-gray-700 !rounded-full !bg-semi-color-fill-0 dark:!bg-semi-color-fill-1 hover:!bg-semi-color-fill-1 dark:hover:!bg-semi-color-fill-2',
  };

  return <Button {...buttonProps} />;
};

export default NotificationButton;
