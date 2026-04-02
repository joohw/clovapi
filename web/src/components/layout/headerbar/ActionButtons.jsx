import React from 'react';
import NewYearButton from './NewYearButton';
import UserArea from './UserArea';

const ActionButtons = ({
  isNewYear,
  userState,
  isLoading,
  isMobile,
}) => {
  return (
    <div className='flex items-center gap-2 md:gap-3 mr-2 md:mr-4'>
      <NewYearButton isNewYear={isNewYear} />
      <UserArea
        userState={userState}
        isLoading={isLoading}
        isMobile={isMobile}
      />
    </div>
  );
};

export default ActionButtons;
