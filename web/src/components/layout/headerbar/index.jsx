import React from 'react';
import { useHeaderBar } from '../../../hooks/common/useHeaderBar';
import { useNavigation } from '../../../hooks/common/useNavigation';
import MobileMenuButton from './MobileMenuButton';
import Navigation from './Navigation';
import ActionButtons from './ActionButtons';

const HeaderBar = ({ onMobileMenuToggle, drawerOpen }) => {
  const {
    userState,
    isMobile,
    collapsed,
    isLoading,
    isNewYear,
    isConsoleRoute,
    headerNavModules,
    pricingRequireAuth,
    handleMobileMenuToggle,
  } = useHeaderBar({ onMobileMenuToggle, drawerOpen });

  const { mainNavLinks } = useNavigation(headerNavModules);

  return (
    <header className='text-semi-color-text-0 sticky top-0 z-50 transition-colors duration-300 bg-white/75 dark:bg-zinc-900/75 backdrop-blur-lg'>
      <div className='w-full px-2'>
        <div className='flex items-center justify-between h-16'>
          <div className='flex items-center'>
            <MobileMenuButton
              isConsoleRoute={isConsoleRoute}
              isMobile={isMobile}
              drawerOpen={drawerOpen}
              collapsed={collapsed}
              onToggle={handleMobileMenuToggle}
            />
          </div>
          <Navigation
            mainNavLinks={mainNavLinks}
            isMobile={isMobile}
            isLoading={isLoading}
            userState={userState}
            pricingRequireAuth={pricingRequireAuth}
          />

          <ActionButtons
            isNewYear={isNewYear}
            userState={userState}
            isLoading={isLoading}
            isMobile={isMobile}
          />
        </div>
      </div>
    </header>
  );
};

export default HeaderBar;
