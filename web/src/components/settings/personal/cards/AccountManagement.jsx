import React from 'react';
import {
  Button,
  Card,
  Input,
  Space,
  Typography,
  Avatar,
  Tabs,
  TabPane,
  Popover,
  Modal,
} from '@douyinfe/semi-ui';
import {
  IconMail,
  IconShield,
  IconGithubLogo,
  IconKey,
  IconLock,
  IconDelete,
} from '@douyinfe/semi-icons';
import { SiTelegram, SiWechat, SiLinux, SiDiscord } from 'react-icons/si';
import { UserPlus, ShieldCheck } from 'lucide-react';
import TelegramLoginButton from 'react-telegram-login';
import {
  API,
  showError,
  showSuccess,
  onGitHubOAuthClicked,
  onOIDCClicked,
  onLinuxDOOAuthClicked,
  onDiscordOAuthClicked,
  onCustomOAuthClicked,
  getOAuthProviderIcon,
} from '../../../../helpers';
import TwoFASetting from '../components/TwoFASetting';

const AccountManagement = ({
  t,
  userState,
  status,
  systemToken,
  setShowEmailBindModal,
  setShowWeChatBindModal,
  generateAccessToken,
  handleSystemTokenClick,
  setShowChangePasswordModal,
  setShowAccountDeleteModal,
  passkeyStatus,
  passkeySupported,
  passkeyRegisterLoading,
  passkeyDeleteLoading,
  onPasskeyRegister,
  onPasskeyDelete,
}) => {
  const renderAccountInfo = (accountId, label) => {
    if (!accountId || accountId === '') {
      return <span className='text-gray-500'>{"未绑定"}</span>;
    }

    const popContent = (
      <div className='text-xs p-2'>
        <Typography.Paragraph copyable={{ content: accountId }}>
          {accountId}
        </Typography.Paragraph>
        {label ? (
          <div className='mt-1 text-[11px] text-gray-500'>{label}</div>
        ) : null}
      </div>
    );

    return (
      <Popover content={popContent} position='top' trigger='hover'>
        <span className='block max-w-full truncate text-gray-600 hover:text-blue-600 cursor-pointer'>
          {accountId}
        </span>
      </Popover>
    );
  };
  const isBound = (accountId) => Boolean(accountId);
  const [showTelegramBindModal, setShowTelegramBindModal] =
    React.useState(false);
  const [customOAuthBindings, setCustomOAuthBindings] = React.useState([]);
  const [customOAuthLoading, setCustomOAuthLoading] = React.useState({});

  // Fetch custom OAuth bindings
  const loadCustomOAuthBindings = async () => {
    try {
      const res = await API.get('/api/user/oauth/bindings');
      if (res.data.success) {
        setCustomOAuthBindings(res.data.data || []);
      } else {
        showError(res.data.message || "获取绑定信息失败");
      }
    } catch (error) {
      showError(error.response?.data?.message || error.message || "获取绑定信息失败");
    }
  };

  // Unbind custom OAuth provider
  const handleUnbindCustomOAuth = async (providerId, providerName) => {
    Modal.confirm({
      title: "确认解绑",
      content: `确定要解绑 ${providerName} 吗？`,
      okText: "确认",
      cancelText: "取消",
      onOk: async () => {
        setCustomOAuthLoading((prev) => ({ ...prev, [providerId]: true }));
        try {
          const res = await API.delete(`/api/user/oauth/bindings/${providerId}`);
          if (res.data.success) {
            showSuccess("解绑成功");
            await loadCustomOAuthBindings();
          } else {
            showError(res.data.message);
          }
        } catch (error) {
          showError(error.response?.data?.message || error.message || "操作失败");
        } finally {
          setCustomOAuthLoading((prev) => ({ ...prev, [providerId]: false }));
        }
      },
    });
  };

  // Handle bind custom OAuth
  const handleBindCustomOAuth = (provider) => {
    onCustomOAuthClicked(provider);
  };

  // Check if custom OAuth provider is bound
  const isCustomOAuthBound = (providerId) => {
    const normalizedId = Number(providerId);
    return customOAuthBindings.some((b) => Number(b.provider_id) === normalizedId);
  };

  // Get binding info for a provider
  const getCustomOAuthBinding = (providerId) => {
    const normalizedId = Number(providerId);
    return customOAuthBindings.find((b) => Number(b.provider_id) === normalizedId);
  };

  React.useEffect(() => {
    loadCustomOAuthBindings();
  }, []);

  const passkeyEnabled = passkeyStatus?.enabled;
  const lastUsedLabel = passkeyStatus?.last_used_at
    ? new Date(passkeyStatus.last_used_at).toLocaleString()
    : "尚未使用";

  return (
    <Card className='!rounded-2xl'>
      {/* 卡片头部 */}
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='teal' className='mr-3 shadow-md'>
          <UserPlus size={16} />
        </Avatar>
        <div>
          <Typography.Text className='text-lg font-medium'>
            {"账户管理"}
          </Typography.Text>
          <div className='text-xs text-gray-600'>
            {"账户绑定、安全设置和身份验证"}
          </div>
        </div>
      </div>

      <Tabs type='card' defaultActiveKey='binding'>
        {/* 账户绑定 Tab */}
        <TabPane
          tab={
            <div className='flex items-center'>
              <UserPlus size={16} className='mr-2' />
              {"账户绑定"}
            </div>
          }
          itemKey='binding'
        >
          <div className='py-4'>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
              {/* 邮箱绑定 */}
              <Card className='!rounded-xl'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center flex-1 min-w-0'>
                    <div className='w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3 flex-shrink-0'>
                      <IconMail
                        size='default'
                        className='text-slate-600 dark:text-slate-300'
                      />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-gray-900'>
                        {"邮箱"}
                      </div>
                      <div className='text-sm text-gray-500 truncate'>
                        {renderAccountInfo(
                          userState.user?.email,
                          "邮箱地址",
                        )}
                      </div>
                    </div>
                  </div>
                  <div className='flex-shrink-0'>
                    <Button
                      type='primary'
                      theme='outline'
                      size='small'
                      onClick={() => setShowEmailBindModal(true)}
                    >
                      {isBound(userState.user?.email)
                        ? "修改绑定"
                        : "绑定"}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* 微信绑定 */}
              <Card className='!rounded-xl'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center flex-1 min-w-0'>
                    <div className='w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3 flex-shrink-0'>
                      <SiWechat
                        size={20}
                        className='text-slate-600 dark:text-slate-300'
                      />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-gray-900'>
                        {"微信"}
                      </div>
                      <div className='text-sm text-gray-500 truncate'>
                        {!status.wechat_login
                          ? "未启用"
                          : isBound(userState.user?.wechat_id)
                            ? "已绑定"
                            : "未绑定"}
                      </div>
                    </div>
                  </div>
                  <div className='flex-shrink-0'>
                    <Button
                      type='primary'
                      theme='outline'
                      size='small'
                      disabled={!status.wechat_login}
                      onClick={() => setShowWeChatBindModal(true)}
                    >
                      {isBound(userState.user?.wechat_id)
                        ? "修改绑定"
                        : status.wechat_login
                          ? "绑定"
                          : "未启用"}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* GitHub绑定 */}
              <Card className='!rounded-xl'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center flex-1 min-w-0'>
                    <div className='w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3 flex-shrink-0'>
                      <IconGithubLogo
                        size='default'
                        className='text-slate-600 dark:text-slate-300'
                      />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-gray-900'>
                        {"GitHub"}
                      </div>
                      <div className='text-sm text-gray-500 truncate'>
                        {renderAccountInfo(
                          userState.user?.github_id,
                          "GitHub ID",
                        )}
                      </div>
                    </div>
                  </div>
                  <div className='flex-shrink-0'>
                    <Button
                      type='primary'
                      theme='outline'
                      size='small'
                      onClick={() =>
                        onGitHubOAuthClicked(status.github_client_id)
                      }
                      disabled={
                        isBound(userState.user?.github_id) ||
                        !status.github_oauth
                      }
                    >
                      {status.github_oauth ? "绑定" : "未启用"}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Discord绑定 */}
              <Card className='!rounded-xl'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center flex-1 min-w-0'>
                    <div className='w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3 flex-shrink-0'>
                      <SiDiscord
                        size={20}
                        className='text-slate-600 dark:text-slate-300'
                      />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-gray-900'>
                        {"Discord"}
                      </div>
                      <div className='text-sm text-gray-500 truncate'>
                        {renderAccountInfo(
                          userState.user?.discord_id,
                          "Discord ID",
                        )}
                      </div>
                    </div>
                  </div>
                  <div className='flex-shrink-0'>
                    <Button
                      type='primary'
                      theme='outline'
                      size='small'
                      onClick={() =>
                        onDiscordOAuthClicked(status.discord_client_id)
                      }
                      disabled={
                        isBound(userState.user?.discord_id) ||
                        !status.discord_oauth
                      }
                    >
                      {status.discord_oauth ? "绑定" : "未启用"}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* OIDC绑定 */}
              <Card className='!rounded-xl'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center flex-1 min-w-0'>
                    <div className='w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3 flex-shrink-0'>
                      <IconShield
                        size='default'
                        className='text-slate-600 dark:text-slate-300'
                      />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-gray-900'>
                        {"OIDC"}
                      </div>
                      <div className='text-sm text-gray-500 truncate'>
                        {renderAccountInfo(
                          userState.user?.oidc_id,
                          "OIDC ID",
                        )}
                      </div>
                    </div>
                  </div>
                  <div className='flex-shrink-0'>
                    <Button
                      type='primary'
                      theme='outline'
                      size='small'
                      onClick={() =>
                        onOIDCClicked(
                          status.oidc_authorization_endpoint,
                          status.oidc_client_id,
                        )
                      }
                      disabled={
                        isBound(userState.user?.oidc_id) || !status.oidc_enabled
                      }
                    >
                      {status.oidc_enabled ? "绑定" : "未启用"}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Telegram绑定 */}
              <Card className='!rounded-xl'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center flex-1 min-w-0'>
                    <div className='w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3 flex-shrink-0'>
                      <SiTelegram
                        size={20}
                        className='text-slate-600 dark:text-slate-300'
                      />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-gray-900'>
                        {"Telegram"}
                      </div>
                      <div className='text-sm text-gray-500 truncate'>
                        {renderAccountInfo(
                          userState.user?.telegram_id,
                          "Telegram ID",
                        )}
                      </div>
                    </div>
                  </div>
                  <div className='flex-shrink-0'>
                    {status.telegram_oauth ? (
                      isBound(userState.user?.telegram_id) ? (
                        <Button
                          disabled
                          size='small'
                          type='primary'
                          theme='outline'
                        >
                          {"已绑定"}
                        </Button>
                      ) : (
                        <Button
                          type='primary'
                          theme='outline'
                          size='small'
                          onClick={() => setShowTelegramBindModal(true)}
                        >
                          {"绑定"}
                        </Button>
                      )
                    ) : (
                      <Button
                        disabled
                        size='small'
                        type='primary'
                        theme='outline'
                      >
                        {"未启用"}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
              <Modal
                title={"绑定 Telegram"}
                visible={showTelegramBindModal}
                onCancel={() => setShowTelegramBindModal(false)}
                footer={null}
              >
                <div className='my-3 text-sm text-gray-600'>
                  {"点击下方按钮通过 Telegram 完成绑定"}
                </div>
                <div className='flex justify-center'>
                  <div className='scale-90'>
                    <TelegramLoginButton
                      dataAuthUrl='/api/oauth/telegram/bind'
                      botName={status.telegram_bot_name}
                    />
                  </div>
                </div>
              </Modal>

              {/* LinuxDO绑定 */}
              <Card className='!rounded-xl'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center flex-1 min-w-0'>
                    <div className='w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3 flex-shrink-0'>
                      <SiLinux
                        size={20}
                        className='text-slate-600 dark:text-slate-300'
                      />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-gray-900'>
                        {"LinuxDO"}
                      </div>
                      <div className='text-sm text-gray-500 truncate'>
                        {renderAccountInfo(
                          userState.user?.linux_do_id,
                          "LinuxDO ID",
                        )}
                      </div>
                    </div>
                  </div>
                  <div className='flex-shrink-0'>
                    <Button
                      type='primary'
                      theme='outline'
                      size='small'
                      onClick={() =>
                        onLinuxDOOAuthClicked(status.linuxdo_client_id)
                      }
                      disabled={
                        isBound(userState.user?.linux_do_id) ||
                        !status.linuxdo_oauth
                      }
                    >
                      {status.linuxdo_oauth ? "绑定" : "未启用"}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* 自定义 OAuth 提供商绑定 */}
              {status.custom_oauth_providers &&
                status.custom_oauth_providers.map((provider) => {
                  const bound = isCustomOAuthBound(provider.id);
                  const binding = getCustomOAuthBinding(provider.id);
                  return (
                    <Card key={provider.slug} className='!rounded-xl'>
                      <div className='flex items-center justify-between gap-3'>
                        <div className='flex items-center flex-1 min-w-0'>
                          <div className='w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3 flex-shrink-0'>
                            {getOAuthProviderIcon(
                              provider.icon || binding?.provider_icon || '',
                              20,
                            )}
                          </div>
                          <div className='flex-1 min-w-0'>
                            <div className='font-medium text-gray-900'>
                              {provider.name}
                            </div>
                            <div className='text-sm text-gray-500 truncate'>
                              {bound
                                ? renderAccountInfo(
                                    binding?.provider_user_id,
                                    `${provider.name} ID`,
                                  )
                                : "未绑定"}
                            </div>
                          </div>
                        </div>
                        <div className='flex-shrink-0'>
                          {bound ? (
                            <Button
                              type='danger'
                              theme='outline'
                              size='small'
                              loading={customOAuthLoading[provider.id]}
                              onClick={() =>
                                handleUnbindCustomOAuth(provider.id, provider.name)
                              }
                            >
                              {"解绑"}
                            </Button>
                          ) : (
                            <Button
                              type='primary'
                              theme='outline'
                              size='small'
                              onClick={() => handleBindCustomOAuth(provider)}
                            >
                              {"绑定"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
            </div>
          </div>
        </TabPane>

        {/* 安全设置 Tab */}
        <TabPane
          tab={
            <div className='flex items-center'>
              <ShieldCheck size={16} className='mr-2' />
              {"安全设置"}
            </div>
          }
          itemKey='security'
        >
          <div className='py-4'>
            <div className='space-y-6'>
              <Space vertical className='w-full'>
                {/* 系统访问令牌 */}
                <Card className='!rounded-xl w-full'>
                  <div className='flex flex-col sm:flex-row items-start sm:justify-between gap-4'>
                    <div className='flex items-start w-full sm:w-auto'>
                      <div className='w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mr-4 flex-shrink-0'>
                        <IconKey size='large' className='text-slate-600' />
                      </div>
                      <div className='flex-1'>
                        <Typography.Title heading={6} className='mb-1'>
                          {"系统访问令牌"}
                        </Typography.Title>
                        <Typography.Text type='tertiary' className='text-sm'>
                          {"用于API调用的身份验证令牌，请妥善保管"}
                        </Typography.Text>
                        {systemToken && (
                          <div className='mt-3'>
                            <Input
                              readonly
                              value={systemToken}
                              onClick={handleSystemTokenClick}
                              size='large'
                              prefix={<IconKey />}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      type='primary'
                      theme='solid'
                      onClick={generateAccessToken}
                      className='!bg-slate-600 hover:!bg-slate-700 w-full sm:w-auto'
                      icon={<IconKey />}
                    >
                      {systemToken ? "重新生成" : "生成令牌"}
                    </Button>
                  </div>
                </Card>

                {/* 密码管理 */}
                <Card className='!rounded-xl w-full'>
                  <div className='flex flex-col sm:flex-row items-start sm:justify-between gap-4'>
                    <div className='flex items-start w-full sm:w-auto'>
                      <div className='w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mr-4 flex-shrink-0'>
                        <IconLock size='large' className='text-slate-600' />
                      </div>
                      <div>
                        <Typography.Title heading={6} className='mb-1'>
                          {"密码管理"}
                        </Typography.Title>
                        <Typography.Text type='tertiary' className='text-sm'>
                          {"定期更改密码可以提高账户安全性"}
                        </Typography.Text>
                      </div>
                    </div>
                    <Button
                      type='primary'
                      theme='solid'
                      onClick={() => setShowChangePasswordModal(true)}
                      className='!bg-slate-600 hover:!bg-slate-700 w-full sm:w-auto'
                      icon={<IconLock />}
                    >
                      {"修改密码"}
                    </Button>
                  </div>
                </Card>

                {/* Passkey 设置 */}
                <Card className='!rounded-xl w-full'>
                  <div className='flex flex-col sm:flex-row items-start sm:justify-between gap-4'>
                    <div className='flex items-start w-full sm:w-auto'>
                      <div className='w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mr-4 flex-shrink-0'>
                        <IconKey size='large' className='text-slate-600' />
                      </div>
                      <div>
                        <Typography.Title heading={6} className='mb-1'>
                          {"Passkey 登录"}
                        </Typography.Title>
                        <Typography.Text type='tertiary' className='text-sm'>
                          {passkeyEnabled
                            ? "已启用 Passkey，无需密码即可登录"
                            : "使用 Passkey 实现免密且更安全的登录体验"}
                        </Typography.Text>
                        <div className='mt-2 text-xs text-gray-500 space-y-1'>
                          <div>
                            {"最后使用时间"}：{lastUsedLabel}
                          </div>
                          {/*{passkeyEnabled && (*/}
                          {/*  <div>*/}
                          {/*    {"备份支持"}：*/}
                          {/*    {passkeyStatus?.backup_eligible*/}
                          {/*      ? "支持备份"*/}
                          {/*      : "不支持"}*/}
                          {/*    ，{"备份状态"}：*/}
                          {/*    {passkeyStatus?.backup_state ? "已备份" : "未备份"}*/}
                          {/*  </div>*/}
                          {/*)}*/}
                          {!passkeySupported && (
                            <div className='text-amber-600'>
                              {"当前设备不支持 Passkey"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      type={passkeyEnabled ? 'danger' : 'primary'}
                      theme={passkeyEnabled ? 'solid' : 'solid'}
                      onClick={
                        passkeyEnabled
                          ? () => {
                              Modal.confirm({
                                title: "确认解绑 Passkey",
                                content: "解绑后将无法使用 Passkey 登录，确定要继续吗？",
                                okText: "确认解绑",
                                cancelText: "取消",
                                okType: 'danger',
                                onOk: onPasskeyDelete,
                              });
                            }
                          : onPasskeyRegister
                      }
                      className={`w-full sm:w-auto ${passkeyEnabled ? '!bg-slate-500 hover:!bg-slate-600' : ''}`}
                      icon={<IconKey />}
                      disabled={!passkeySupported && !passkeyEnabled}
                      loading={
                        passkeyEnabled
                          ? passkeyDeleteLoading
                          : passkeyRegisterLoading
                      }
                    >
                      {passkeyEnabled ? "解绑 Passkey" : "注册 Passkey"}
                    </Button>
                  </div>
                </Card>

                {/* 两步验证设置 */}
                <TwoFASetting />

                {/* 危险区域 */}
                <Card className='!rounded-xl w-full'>
                  <div className='flex flex-col sm:flex-row items-start sm:justify-between gap-4'>
                    <div className='flex items-start w-full sm:w-auto'>
                      <div className='w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mr-4 flex-shrink-0'>
                        <IconDelete size='large' className='text-slate-600' />
                      </div>
                      <div>
                        <Typography.Title
                          heading={6}
                          className='mb-1 text-slate-700'
                        >
                          {"删除账户"}
                        </Typography.Title>
                        <Typography.Text type='tertiary' className='text-sm'>
                          {"此操作不可逆，所有数据将被永久删除"}
                        </Typography.Text>
                      </div>
                    </div>
                    <Button
                      type='danger'
                      theme='solid'
                      onClick={() => setShowAccountDeleteModal(true)}
                      className='w-full sm:w-auto !bg-slate-500 hover:!bg-slate-600'
                      icon={<IconDelete />}
                    >
                      {"删除账户"}
                    </Button>
                  </div>
                </Card>
              </Space>
            </div>
          </div>
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default AccountManagement;
