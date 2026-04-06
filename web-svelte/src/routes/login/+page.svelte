<svelte:options runes={false} />

<script>
  import { goto } from '$app/navigation';
  import { apiPost } from '$lib/api';

  let username = '';
  let password = '';
  let loading = false;
  let errorMsg = '';

  /**
   * @param {SubmitEvent} event
   */
  async function handleSubmit(event) {
    event.preventDefault();
    errorMsg = '';

    if (!username || !password) {
      errorMsg = '请输入用户名和密码';
      return;
    }

    loading = true;
    try {
      const res = await apiPost('/api/user/login', { username, password });
      if (res?.success) {
        localStorage.setItem('user', JSON.stringify(res.data));
        goto('/playground');
      } else {
        errorMsg = res?.message || '登录失败';
      }
    } catch (err) {
      errorMsg = '登录失败，请稍后重试';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-shell">
    <div class="auth-card">
      <h1 class="auth-title">登录</h1>
      <div class="auth-body">
        <form class="space-y-3" onsubmit={handleSubmit}>
          <div>
            <label class="auth-label" for="login-username">用户名或邮箱</label>
            <input
              id="login-username"
              class="auth-input"
              type="text"
              bind:value={username}
              autocomplete="username"
              placeholder="请输入用户名或邮箱地址"
            />
          </div>
          <div>
            <label class="auth-label" for="login-password">密码</label>
            <input
              id="login-password"
              class="auth-input"
              type="password"
              bind:value={password}
              autocomplete="current-password"
              placeholder="请输入密码"
            />
          </div>

          {#if errorMsg}
            <p class="text-sm text-red-500">{errorMsg}</p>
          {/if}

          <div class="auth-actions">
            <button class="w-full rounded-none bg-black text-white h-10 disabled:opacity-60" type="submit" disabled={loading}>
              {loading ? '登录中...' : '继续'}
            </button>
          </div>
        </form>

        <div class="mt-6 text-center text-sm">
          <a class="text-blue-600 hover:text-blue-800 mr-3" href="/reset">忘记密码？</a>
          <a class="text-blue-600 hover:text-blue-800" href="/register">注册</a>
        </div>
      </div>
    </div>
  </div>
</div>
