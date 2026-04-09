import React from 'react';
import { Empty } from '@douyinfe/semi-ui';
import {
  IllustrationNoAccess,
  IllustrationNoAccessDark,
} from '@douyinfe/semi-illustrations';
const Forbidden = () => {
  return (
    <div className='flex justify-center items-center h-screen p-8'>
      <Empty
        image={<IllustrationNoAccess style={{ width: 250, height: 250 }} />}
        darkModeImage={
          <IllustrationNoAccessDark style={{ width: 250, height: 250 }} />
        }
        description={"您无权访问此页面，请联系管理员"}
      />
    </div>
  );
};

export default Forbidden;
