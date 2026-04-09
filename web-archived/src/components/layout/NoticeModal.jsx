import React, { useEffect, useState } from 'react';
import { Button, Modal, Empty } from '@douyinfe/semi-ui';
import { API, showError } from '../../helpers';
import { marked } from 'marked';
import {
  IllustrationNoContent,
  IllustrationNoContentDark,
} from '@douyinfe/semi-illustrations';

const NoticeModal = ({
  visible,
  onClose,
  isMobile,
}) => {
  const [noticeContent, setNoticeContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCloseTodayNotice = () => {
    const today = new Date().toDateString();
    localStorage.setItem('notice_close_date', today);
    onClose();
  };

  const displayNotice = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/notice');
      const { success, message, data } = res.data;
      if (success) {
        if (data !== '') {
          const htmlNotice = marked.parse(data);
          setNoticeContent(htmlNotice);
        } else {
          setNoticeContent('');
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      displayNotice();
    }
  }, [visible]);

  const renderMarkdownNotice = () => {
    if (loading) {
      return (
        <div className='py-12'>
          <Empty description={"加载中..."} />
        </div>
      );
    }

    if (!noticeContent) {
      return (
        <div className='py-12'>
          <Empty
            image={
              <IllustrationNoContent style={{ width: 150, height: 150 }} />
            }
            darkModeImage={
              <IllustrationNoContentDark style={{ width: 150, height: 150 }} />
            }
            description={"暂无通知"}
          />
        </div>
      );
    }

    return (
      <div
        dangerouslySetInnerHTML={{ __html: noticeContent }}
        className='notice-content-scroll max-h-[55vh] overflow-y-auto pr-2'
      />
    );
  };

  return (
    <Modal
      title={"通知"}
      visible={visible}
      onCancel={onClose}
      footer={
        <div className='flex justify-end'>
          <Button type='secondary' onClick={handleCloseTodayNotice}>
            {"今日关闭"}
          </Button>
          <Button type='primary' onClick={onClose}>
            {"关闭公告"}
          </Button>
        </div>
      }
      size={isMobile ? 'full-width' : 'large'}
    >
      {renderMarkdownNotice()}
    </Modal>
  );
};

export default NoticeModal;
