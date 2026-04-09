import { useMemo } from 'react';

export const useNavigation = (headerNavModules) => {
  const mainNavLinks = useMemo(() => {
    // 默认配置，如果没有传入配置则显示所有模块
    const defaultModules = {
      home: true,
      playground: true,
      apikeys: true,
      pricing: true,
      about: true,
    };

    // 使用传入的配置或默认配置
    const modules = headerNavModules || defaultModules;

    const allLinks = [
      {
        text: "首页",
        itemKey: 'home',
        to: '/',
      },
      {
        text: "模型列表",
        itemKey: 'pricing',
        to: '/pricing',
      },
      {
        text: "教程",
        itemKey: 'about',
        to: '/about',
      },
      {
        text: 'Playground',
        itemKey: 'playground',
        to: '/playground',
      },
      {
        text: 'API 密钥',
        itemKey: 'apikeys',
        to: '/apikeys',
      },
    ];

    // 根据配置过滤导航链接
    return allLinks.filter((link) => {
      if (link.itemKey === 'home') {
        return modules.home === true;
      }
      if (link.itemKey === 'pricing') {
        // 支持新的pricing配置格式
        return typeof modules.pricing === 'object'
          ? modules.pricing.enabled
          : modules.pricing;
      }
      if (link.itemKey === 'playground') {
        return modules.playground !== false;
      }
      if (link.itemKey === 'apikeys') {
        return true;
      }
      return modules[link.itemKey] === true;
    });
  }, [headerNavModules]);

  return {
    mainNavLinks,
  };
};
