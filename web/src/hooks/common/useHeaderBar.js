import { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../../context/User';
import { StatusContext } from '../../context/Status';
import { useActualTheme } from '../../context/Theme';
import { getLogo, getSystemName, API, showSuccess } from '../../helpers';
import { useIsMobile } from './useIsMobile';
import { useSidebarCollapsed } from './useSidebarCollapsed';
import { useMinimumLoadingTime } from './useMinimumLoadingTime';

export const useHeaderBar = ({ onMobileMenuToggle, drawerOpen }) => {
  const { t } = useTranslation();
  const [userState, userDispatch] = useContext(UserContext);
  const [statusState] = useContext(StatusContext);
  const isMobile = useIsMobile();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [logoLoaded, setLogoLoaded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const loading = statusState?.status === undefined;
  const isLoading = useMinimumLoadingTime(loading, 200);

  const systemName = getSystemName();
  const logo = getLogo();
  const currentDate = new Date();
  const isNewYear = currentDate.getMonth() === 0 && currentDate.getDate() === 1;

  const isSelfUseMode = statusState?.status?.self_use_mode_enabled || false;
  const isDemoSiteMode = statusState?.status?.demo_site_enabled || false;

  // 获取顶栏模块配置
  const headerNavModulesConfig = statusState?.status?.HeaderNavModules;

  // 使用useMemo确保headerNavModules正确响应statusState变化
  const headerNavModules = useMemo(() => {
    if (headerNavModulesConfig) {
      try {
        const modules = JSON.parse(headerNavModulesConfig);

        // 处理向后兼容性：如果pricing是boolean，转换为对象格式
        if (typeof modules.pricing === 'boolean') {
          modules.pricing = {
            enabled: modules.pricing,
            requireAuth: false, // 默认不需要登录鉴权
          };
        }

        return modules;
      } catch (error) {
        console.error('解析顶栏模块配置失败:', error);
        return null;
      }
    }
    return null;
  }, [headerNavModulesConfig]);

  // 获取模型广场权限配置
  const pricingRequireAuth = useMemo(() => {
    if (headerNavModules?.pricing) {
      return typeof headerNavModules.pricing === 'object'
        ? headerNavModules.pricing.requireAuth
        : false; // 默认不需要登录
    }
    return false; // 默认不需要登录
  }, [headerNavModules]);

  const isConsoleRoute = location.pathname.startsWith('/console');
  const isHomeRoute = location.pathname === '/';
  const actualTheme = useActualTheme();

  // Logo loading effect
  useEffect(() => {
    setLogoLoaded(false);
    if (!logo) return;
    const img = new Image();
    img.src = logo;
    img.onload = () => setLogoLoaded(true);
  }, [logo]);

  // Send theme to iframe
  useEffect(() => {
    try {
      const iframe = document.querySelector('iframe');
      const cw = iframe && iframe.contentWindow;
      if (cw) {
        cw.postMessage({ themeMode: actualTheme }, '*');
      }
    } catch (e) {
      // Silently ignore cross-origin or access errors
    }
  }, [actualTheme]);

  // Actions
  const logout = useCallback(async () => {
    await API.get('/api/user/logout');
    showSuccess(t('注销成功!'));
    userDispatch({ type: 'logout' });
    localStorage.removeItem('user');
    navigate('/login');
  }, [navigate, t, userDispatch]);

  const handleMobileMenuToggle = useCallback(() => {
    if (isMobile) {
      onMobileMenuToggle();
    } else {
      toggleCollapsed();
    }
  }, [isMobile, onMobileMenuToggle, toggleCollapsed]);

  return {
    // State
    userState,
    statusState,
    isMobile,
    collapsed,
    logoLoaded,
    location,
    isLoading,
    systemName,
    logo,
    isNewYear,
    isSelfUseMode,
    isDemoSiteMode,
    isConsoleRoute,
    isHomeRoute,
    drawerOpen,
    headerNavModules,
    pricingRequireAuth,

    // Actions
    logout,
    handleMobileMenuToggle,
    navigate,
    t,
  };
};
