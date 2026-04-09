import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button, Typography } from '@douyinfe/semi-ui';
import { stringToColor } from '../../../helpers';
import SkeletonWrapper from '../components/SkeletonWrapper';

const UserArea = ({
  userState,
  isLoading,
  isMobile,
}) => {
  const buttonRef = useRef(null);
  if (isLoading) {
    return (
      <SkeletonWrapper
        loading={true}
        type='userArea'
        width={50}
        isMobile={isMobile}
      />
    );
  }

  if (userState.user) {
    return (
      <div className='relative' ref={buttonRef}>
        <Link to='/console' className='flex'>
          <Button
            theme='borderless'
            type='tertiary'
            className='flex items-center gap-1.5 !p-1 !rounded-full hover:!bg-semi-color-fill-1 dark:hover:!bg-gray-700 !bg-semi-color-fill-0 dark:!bg-semi-color-fill-1 dark:hover:!bg-semi-color-fill-2'
          >
            <Avatar
              size='extra-small'
              color={stringToColor(userState.user.username)}
              className='mr-1'
            >
              {userState.user.username[0].toUpperCase()}
            </Avatar>
            <span className='hidden md:inline'>
              <Typography.Text className='!text-xs !font-medium !text-semi-color-text-1 dark:!text-gray-300 mr-1 whitespace-nowrap'>
                {"控制台"}
              </Typography.Text>
            </span>
          </Button>
        </Link>
      </div>
    );
  } else {
    const loginButtonClasses =
      'flex items-center justify-center !py-[10px] !px-1.5 !rounded-full !bg-semi-color-fill-0 dark:!bg-semi-color-fill-1 hover:!bg-semi-color-fill-1 dark:hover:!bg-gray-700 transition-colors';
    const loginButtonTextSpanClass =
      '!text-xs !text-semi-color-text-1 dark:!text-gray-300 !p-1.5';

    return (
      <div className='flex items-center'>
        <Link to='/login' className='flex'>
          <Button
            theme='borderless'
            type='tertiary'
            className={loginButtonClasses}
          >
            <span className={loginButtonTextSpanClass}>{"登录"}</span>
          </Button>
        </Link>
      </div>
    );
  }
};

export default UserArea;
