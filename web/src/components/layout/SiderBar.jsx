import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getLucideIcon } from '../../helpers/render';
import { useSidebar } from '../../hooks/common/useSidebar';
import { useMinimumLoadingTime } from '../../hooks/common/useMinimumLoadingTime';
import { API, isAdmin, isRoot, showSuccess } from '../../helpers';
import { UserContext } from '../../context/User';
import SkeletonWrapper from './components/SkeletonWrapper';
import { Nav, Divider, Modal } from '@douyinfe/semi-ui';

const routerMap = {
  home: '/',
  channel: '/console/channel',
  token: '/apikeys',
  redemption: '/console/redemption',
  topup: '/console/topup',
  user: '/console/user',
  subscription: '/console/subscription',
  log: '/console/log',
  midjourney: '/console/midjourney',
  setting: '/console/setting',
  about: '/about',
  detail: '/console',
  pricing: '/pricing',
  models: '/console/models',
  deployment: '/console/deployment',
  personal: '/console/personal',
};

const SiderBar = ({ onNavigate = () => {} }) => {
  const [, userDispatch] = useContext(UserContext);
  const navigate = useNavigate();
  const {
    isModuleVisible,
    loading: sidebarLoading,
  } = useSidebar();

  const showSkeleton = useMinimumLoadingTime(sidebarLoading, 200);

  const [selectedKeys, setSelectedKeys] = useState(['home']);
  const [openedKeys, setOpenedKeys] = useState([]);
  const location = useLocation();
  const routerMapState = routerMap;

  const handleLogout = useCallback(() => {
    Modal.confirm({
      title: "确认退出登录",
      content: "退出后需要重新登录，是否继续？",
      okText: "退出登录",
      cancelText: "取消",
      onOk: async () => {
        await API.get('/api/user/logout');
        showSuccess("注销成功!");
        userDispatch({ type: 'logout' });
        localStorage.removeItem('user');
        navigate('/login');
      },
    });
  }, [navigate, userDispatch]);



  const workspaceItems = useMemo(() => {
    const items = [
      {
        text: "数据看板",
        itemKey: 'detail',
        to: '/detail',
        sectionKey: 'console',
        className:
          localStorage.getItem('enable_data_export') === 'true'
            ? ''
            : 'tableHiddle',
      },
      {
        text: "钱包管理",
        itemKey: 'topup',
        to: '/topup',
        sectionKey: 'personal',
      },
      {
        text: "个人设置",
        itemKey: 'personal',
        to: '/personal',
        sectionKey: 'personal',
      },
      {
        text: "退出登录",
        itemKey: 'logout',
        sectionKey: 'personal',
      },
    ];

    // 根据配置过滤项目
    const filteredItems = items.filter((item) => {
      if (item.itemKey === 'logout') return true;
      const configVisible = isModuleVisible(item.sectionKey, item.itemKey);
      return configVisible;
    });

    return filteredItems;
  }, [
    localStorage.getItem('enable_data_export'),
    isModuleVisible,
  ]);

  const adminItems = useMemo(() => {
    const items = [
      {
        text: "渠道管理",
        itemKey: 'channel',
        to: '/channel',
        className: isAdmin() ? '' : 'tableHiddle',
      },
      {
        text: "订阅管理",
        itemKey: 'subscription',
        to: '/subscription',
        className: isAdmin() ? '' : 'tableHiddle',
      },
      {
        text: "模型管理",
        itemKey: 'models',
        to: '/console/models',
        className: isAdmin() ? '' : 'tableHiddle',
      },
      {
        text: "兑换码管理",
        itemKey: 'redemption',
        to: '/redemption',
        className: isAdmin() ? '' : 'tableHiddle',
      },
      {
        text: "用户管理",
        itemKey: 'user',
        to: '/user',
        className: isAdmin() ? '' : 'tableHiddle',
      },
      {
        text: "系统设置",
        itemKey: 'setting',
        to: '/setting',
        className: isRoot() ? '' : 'tableHiddle',
      },
      {
        text: "使用日志",
        itemKey: 'log',
        to: '/log',
        sectionKey: 'console',
        className: isAdmin() ? '' : 'tableHiddle',
      },
      {
        text: "绘图日志",
        itemKey: 'midjourney',
        to: '/midjourney',
        sectionKey: 'console',
        className:
          isAdmin() && localStorage.getItem('enable_drawing') === 'true'
            ? ''
            : 'tableHiddle',
      },
    ];

    // 根据配置过滤项目
    const filteredItems = items.filter((item) => {
      const sectionKey = item.sectionKey || 'admin';
      const configVisible = isModuleVisible(sectionKey, item.itemKey);
      return configVisible;
    });

    return filteredItems;
  }, [isModuleVisible]);

  // 根据当前路径设置选中的菜单项
  useEffect(() => {
    const currentPath = location.pathname;
    let matchingKey = Object.keys(routerMapState).find(
      (key) => routerMapState[key] === currentPath,
    );

    // 如果找到匹配的键，更新选中的键
    if (matchingKey) {
      setSelectedKeys([matchingKey]);
    }
  }, [location.pathname, routerMapState]);

  // 选中高亮颜色（统一）
  const SELECTED_COLOR = 'var(--semi-color-primary)';

  // 渲染自定义菜单项
  const renderNavItem = (item) => {
    // 跳过隐藏的项目
    if (item.className === 'tableHiddle') return null;

    const isSelected = selectedKeys.includes(item.itemKey);
    const textColor = isSelected ? SELECTED_COLOR : 'inherit';

    return (
      <Nav.Item
        key={item.itemKey}
        itemKey={item.itemKey}
        text={
          <span
            className='truncate font-medium text-sm'
            style={{ color: textColor }}
          >
            {item.text}
          </span>
        }
        icon={
          <div className='sidebar-icon-container flex-shrink-0'>
            {getLucideIcon(item.itemKey, isSelected)}
          </div>
        }
        className={item.className}
      />
    );
  };

  // 渲染子菜单项
  const renderSubItem = (item) => {
    if (item.items && item.items.length > 0) {
      const isSelected = selectedKeys.includes(item.itemKey);
      const textColor = isSelected ? SELECTED_COLOR : 'inherit';

      return (
        <Nav.Sub
          key={item.itemKey}
          itemKey={item.itemKey}
          text={
            <span
              className='truncate font-medium text-sm'
              style={{ color: textColor }}
            >
              {item.text}
            </span>
          }
          icon={
            <div className='sidebar-icon-container flex-shrink-0'>
              {getLucideIcon(item.itemKey, isSelected)}
            </div>
          }
        >
          {item.items.map((subItem) => {
            const isSubSelected = selectedKeys.includes(subItem.itemKey);
            const subTextColor = isSubSelected ? SELECTED_COLOR : 'inherit';

            return (
              <Nav.Item
                key={subItem.itemKey}
                itemKey={subItem.itemKey}
                text={
                  <span
                    className='truncate font-medium text-sm'
                    style={{ color: subTextColor }}
                  >
                    {subItem.text}
                  </span>
                }
              />
            );
          })}
        </Nav.Sub>
      );
    } else {
      return renderNavItem(item);
    }
  };

  return (
    <div
      className='sidebar-container'
      style={{
        width: 'var(--sidebar-current-width)',
      }}
    >
      <SkeletonWrapper
        loading={showSkeleton}
        type='sidebar'
        className=''
        collapsed={false}
        showAdmin={isAdmin()}
      >
        <Nav
          className='sidebar-nav'
          defaultIsCollapsed={false}
          isCollapsed={false}
          selectedKeys={selectedKeys}
          itemStyle='sidebar-nav-item'
          hoverStyle='sidebar-nav-item:hover'
          selectedStyle='sidebar-nav-item-selected'
          renderWrapper={({ itemElement, props }) => {
            const to =
              routerMapState[props.itemKey] || routerMap[props.itemKey];

            // 如果没有路由，直接返回元素
            if (!to) return itemElement;

            return (
              <Link
                style={{ textDecoration: 'none' }}
                to={to}
                onClick={onNavigate}
              >
                {itemElement}
              </Link>
            );
          }}
          onSelect={(key) => {
            if (key.itemKey === 'logout') {
              handleLogout();
              return;
            }
            // 如果点击的是已经展开的子菜单的父项，则收起子菜单
            if (openedKeys.includes(key.itemKey)) {
              setOpenedKeys(openedKeys.filter((k) => k !== key.itemKey));
            }

            setSelectedKeys([key.itemKey]);
          }}
          openKeys={openedKeys}
          onOpenChange={(data) => {
            setOpenedKeys(data.openKeys);
          }}
        >
          {/* 控制台区域 */}
          {workspaceItems.length > 0 && (
            <>
              <Divider className='sidebar-divider' />
              <div>
                <div className='sidebar-group-label'>{"控制台"}</div>
                {workspaceItems.map((item) => renderNavItem(item))}
              </div>
            </>
          )}

          {/* 管理员区域 - 只在管理员时显示且配置允许时显示 */}
          {isAdmin() && adminItems.length > 0 && (
            <>
              <Divider className='sidebar-divider' />
              <div>
                <div className='sidebar-group-label'>{"管理员"}</div>
                {adminItems.map((item) => renderNavItem(item))}
              </div>
            </>
          )}
        </Nav>
      </SkeletonWrapper>
    </div>
  );
};

export default SiderBar;
