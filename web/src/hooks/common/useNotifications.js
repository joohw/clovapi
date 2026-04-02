import { useState } from 'react';

export const useNotifications = () => {
  const [noticeVisible, setNoticeVisible] = useState(false);

  // Actions
  const handleNoticeOpen = () => {
    setNoticeVisible(true);
  };

  const handleNoticeClose = () => {
    setNoticeVisible(false);
  };

  return {
    noticeVisible,
    handleNoticeOpen,
    handleNoticeClose,
  };
};
