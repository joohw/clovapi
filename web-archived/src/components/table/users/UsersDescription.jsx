import React from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { IconUserAdd } from '@douyinfe/semi-icons';
import CompactModeToggle from '../../common/ui/CompactModeToggle';

const { Text } = Typography;

const UsersDescription = ({ compactMode, setCompactMode }) => {
  return (
    <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
      <div className='flex items-center text-blue-500'>
        <IconUserAdd className='mr-2' />
        <Text>{"用户管理"}</Text>
      </div>
      <CompactModeToggle
        compactMode={compactMode}
        setCompactMode={setCompactMode}
      />
    </div>
  );
};

export default UsersDescription;
