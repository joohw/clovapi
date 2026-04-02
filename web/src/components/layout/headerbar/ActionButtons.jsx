import React from 'react';
import NewYearButton from './NewYearButton';
import UserArea from './UserArea';

const ActionButtons = ({
  isNewYear,
  userState,
  isLoading,
  isMobile,
  logout,
  navigate,
  t,
}) => {
  return (
    <div className='flex items-center gap-2 md:gap-3'>
      <NewYearButton isNewYear={isNewYear} />
      <UserArea
        userState={userState}
        isLoading={isLoading}
        isMobile={isMobile}
        logout={logout}
        navigate={navigate}
        t={t}
      />
    </div>
  );
};

export default ActionButtons;
