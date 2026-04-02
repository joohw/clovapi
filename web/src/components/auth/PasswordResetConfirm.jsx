import React, { useEffect, useState } from 'react';
import {
  API,
  copy,
  showError,
  showNotice,
} from '../../helpers';
import { useSearchParams, Link } from 'react-router-dom';
import { Button, Card, Typography, Banner } from '@douyinfe/semi-ui';
import { IconCopy } from '@douyinfe/semi-icons';
const { Text, Title } = Typography;

const PasswordResetConfirm = () => {
  const [inputs, setInputs] = useState({
    email: '',
    token: '',
  });
  const { email, token } = inputs;
  const isValidResetLink = email && token;

  const [loading, setLoading] = useState(false);
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [newPassword, setNewPassword] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let token = searchParams.get('token');
    let email = searchParams.get('email');
    setInputs({
      token: token || '',
      email: email || '',
    });
  }, [searchParams]);

  useEffect(() => {
    let countdownInterval = null;
    if (disableButton && countdown > 0) {
      countdownInterval = setInterval(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      setDisableButton(false);
      setCountdown(30);
    }
    return () => clearInterval(countdownInterval);
  }, [disableButton, countdown]);

  async function handleSubmit(e) {
    e?.preventDefault?.();
    if (!email || !token) {
      showError("无效的重置链接，请重新发起密码重置请求");
      return;
    }
    setDisableButton(true);
    setLoading(true);
    const res = await API.post(`/api/user/reset`, {
      email,
      token,
    });
    const { success, message } = res.data;
    if (success) {
      let password = res.data.data;
      setNewPassword(password);
      await copy(password);
      showNotice(`${"密码已重置并已复制到剪贴板："} ${password}`);
    } else {
      showError(message);
    }
    setLoading(false);
  }

  return (
    <div className='bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='w-full max-w-sm mt-[60px]'>
        <div className='flex flex-col items-center'>
          <div className='w-full max-w-md'>
            <Card className='border-0 !rounded-2xl overflow-hidden'>
              <div className='flex justify-center pt-6 pb-2'>
                <Title heading={3} className='text-gray-800 dark:text-gray-200'>
                  {"密码重置确认"}
                </Title>
              </div>
              <div className='px-2 py-8'>
                {!isValidResetLink && (
                  <Banner
                    type='danger'
                    description={"无效的重置链接，请重新发起密码重置请求"}
                    className='mb-4 !rounded-lg'
                    closeIcon={null}
                  />
                )}
                <form className='space-y-4 login-clean-form' onSubmit={handleSubmit}>
                  <div>
                    <label
                      htmlFor='reset-confirm-email'
                      className='block text-sm mb-1 text-semi-color-text-1'
                    >
                      {"邮箱"}
                    </label>
                    <input
                      id='reset-confirm-email'
                      name='email'
                      type='email'
                      value={email}
                      disabled={true}
                      placeholder={email ? '' : "等待获取邮箱信息..."}
                      className='login-clean-native-input'
                    />
                  </div>

                  {newPassword && (
                    <div>
                      <label
                        htmlFor='reset-confirm-password'
                        className='block text-sm mb-1 text-semi-color-text-1'
                      >
                        {"新密码"}
                      </label>
                      <div className='flex items-center gap-2'>
                        <input
                          id='reset-confirm-password'
                          name='newPassword'
                          type='text'
                          value={newPassword}
                          disabled={true}
                          className='login-clean-native-input'
                        />
                        <Button
                          icon={<IconCopy />}
                          type='tertiary'
                          theme='borderless'
                          onClick={async () => {
                            await copy(newPassword);
                            showNotice(
                              `${"密码已复制到剪贴板："} ${newPassword}`,
                            );
                          }}
                        >
                          {"复制"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className='space-y-2 pt-2'>
                    <Button
                      theme='solid'
                      className='w-full !rounded-full'
                      type='primary'
                      htmlType='submit'
                      onClick={handleSubmit}
                      loading={loading}
                      disabled={
                        disableButton || newPassword || !isValidResetLink
                      }
                    >
                      {newPassword ? "密码重置完成" : "确认重置密码"}
                    </Button>
                  </div>
                </form>

                <div className='mt-6 text-center text-sm'>
                  <Text>
                    <Link
                      to='/login'
                      className='text-blue-600 hover:text-blue-800 font-medium'
                    >
                      {"返回登录"}
                    </Link>
                  </Text>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PasswordResetConfirm;
