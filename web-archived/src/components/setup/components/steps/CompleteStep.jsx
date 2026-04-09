import React from 'react';
import { Avatar, Typography, Descriptions } from '@douyinfe/semi-ui';
import { CheckCircle } from 'lucide-react';

const { Text, Title } = Typography;

/**
 * 完成步骤组件
 * 显示配置总结和初始化确认界面
 */
const CompleteStep = ({
  setupStatus,
  formData,
  renderNavigationButtons,
  t,
}) => {
  return (
    <div className='text-center'>
      <Avatar color='green' className='mx-auto mb-4 shadow-lg'>
        <CheckCircle size={24} />
      </Avatar>
      <Title heading={3} className='mb-2'>
        {"准备完成初始化"}
      </Title>
      <Text type='secondary' className='mb-6 block'>
        {"请确认以下设置信息，点击\"初始化系统\"开始配置"}
      </Text>

      <Descriptions>
        <Descriptions.Item itemKey={"数据库类型"}>
          {setupStatus.database_type === 'sqlite'
            ? 'SQLite'
            : setupStatus.database_type === 'mysql'
              ? 'MySQL'
              : 'PostgreSQL'}
        </Descriptions.Item>
        <Descriptions.Item itemKey={"管理员账号"}>
          {setupStatus.root_init
            ? "已初始化"
            : formData.username || "未设置"}
        </Descriptions.Item>
        <Descriptions.Item itemKey={"使用模式"}>
          {formData.usageMode === 'external'
            ? "对外运营模式"
            : formData.usageMode === 'self'
              ? "自用模式"
              : "演示站点模式"}
        </Descriptions.Item>
      </Descriptions>

      {renderNavigationButtons && renderNavigationButtons()}
    </div>
  );
};

export default CompleteStep;
