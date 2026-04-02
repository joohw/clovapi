import React, { useEffect, useState } from 'react';
import {
  API,
  showError,
  showInfo,
  showSuccess,
} from '../../helpers';
import Turnstile from 'react-turnstile';
import { Button, Card, Typography } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
const { Text, Title } = Typography;

const PasswordResetForm = () => {
  const [inputs, setInputs] = useState({
    email: '',
  });
  const { email } = inputs;

  const [loading, setLoading] = useState(false);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    let status = localStorage.getItem('status');
    if (status) {
      status = JSON.parse(status);
      if (status.turnstile_check) {
        setTurnstileEnabled(true);
        setTurnstileSiteKey(status.turnstile_site_key);
      }
    }
  }, []);

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

  function handleChange(value) {
    setInputs((inputs) => ({ ...inputs, email: value }));
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    if (!email) {
      showError("请输入邮箱地址");
      return;
    }
    if (turnstileEnabled && turnstileToken === '') {
      showInfo("请稍后几秒重试，Turnstile 正在检查用户环境！");
      return;
    }
    setDisableButton(true);
    setLoading(true);
    const res = await API.get(
      `/api/reset_password?email=${email}&turnstile=${turnstileToken}`,
    );
    const { success, message } = res.data;
    if (success) {
      showSuccess("重置邮件发送成功，请检查邮箱！");
      setInputs({ ...inputs, email: '' });
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
                  {"密码重置"}
                </Title>
              </div>
              <div className='px-2 py-8'>
                <form className='space-y-3 login-clean-form' onSubmit={handleSubmit}>
                  <div>
                    <label
                      htmlFor='reset-email'
                      className='block text-sm mb-1 text-semi-color-text-1'
                    >
                      {"邮箱"}
                    </label>
                    <input
                      id='reset-email'
                      name='email'
                      type='email'
                      value={email}
                      placeholder='请输入您的邮箱地址'
                      autoComplete='email'
                      onChange={(e) => handleChange(e.target.value)}
                      className='login-clean-native-input'
                    />
                  </div>

                  <div className='space-y-2 pt-2'>
                    <Button
                      theme='solid'
                      className='w-full !rounded-full'
                      type='primary'
                      htmlType='submit'
                      onClick={handleSubmit}
                      loading={loading}
                      disabled={disableButton}
                    >
                      {disableButton
                        ? `${"重试"} (${countdown})`
                        : "提交"}
                    </Button>
                  </div>
                </form>

                <div className='mt-6 text-center text-sm'>
                  <Text>
                    {"想起来了？"}{' '}
                    <Link
                      to='/login'
                      className='text-blue-600 hover:text-blue-800 font-medium'
                    >
                      {"登录"}
                    </Link>
                  </Text>
                </div>
              </div>
            </Card>

            {turnstileEnabled && (
              <div className='flex justify-center mt-6'>
                <Turnstile
                  sitekey={turnstileSiteKey}
                  onVerify={(token) => {
                    setTurnstileToken(token);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PasswordResetForm;
