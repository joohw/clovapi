import React from 'react';
import { Button, Typography } from '@douyinfe/semi-ui';
import { Key } from 'lucide-react';

const { Text } = Typography;

const TokensDescription = ({ setEditingToken, setShowEdit }) => {
  return (
    <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
      <div className='flex items-center text-blue-500'>
        <Key size={16} className='mr-2' />
        <Text>{"API 密钥"}</Text>
      </div>

      <Button
        type='primary'
        size='small'
        onClick={() => {
          setEditingToken({ id: undefined });
          setShowEdit(true);
        }}
      >
        {"创建密钥"}
      </Button>
    </div>
  );
};

export default TokensDescription;
