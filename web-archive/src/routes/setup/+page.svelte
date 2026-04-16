<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiGet, apiPost } from '$lib/api';

  let username = '';
  let password = '';
  let confirmPassword = '';

  let loading = false;
  let checking = true;
  let errorMsg = '';
  let successMsg = '';

  async function checkSetupStatus() {
    try {
      const res = await apiGet('/api/setup');
      if (res?.success && res?.data?.status) {
        goto('/', { replaceState: true });
        return;
      }
    } catch (_) {
      // keep user on page, setup request will show concrete errors
    } finally {
      checking = false;
    }
  }

  /**
   * @param {SubmitEvent} event
   */
  async function handleSubmit(event) {
    event.preventDefault();
    errorMsg = '';
    successMsg = '';

    if (!username || !password || !confirmPassword) {
      errorMsg = '请完整填写管理员账号和密码';
      return;
    }
    if (password !== confirmPassword) {
      errorMsg = '两次输入的密码不一致';
      return;
    }
    if (password.length < 8) {
      errorMsg = '密码长度至少为 8 位';
      return;
    }

    loading = true;
    try {
      const res = await apiPost('/api/setup', {
        username,
        password,
        confirmPassword,
        SelfUseModeEnabled: true,
        DemoSiteEnabled: false
      });
      if (res?.success) {
        successMsg = '初始化成功，请使用新管理员账号登录';
        setTimeout(() => {
          goto('/login', { replaceState: true });
        }, 600);
      } else {
        errorMsg = res?.message || '初始化失败';
      }
    } catch (_) {
      errorMsg = '初始化失败，请稍后重试';
    } finally {
      loading = false;
    }
  }

  onMount(checkSetupStatus);
</script>

<div class="auth-page">
  <div class="auth-shell">
    <div class="auth-card">
      <h1 class="auth-title">系统初始化</h1>
      <div class="auth-body">
        {#if checking}
          <p class="text-sm text-muted-foreground">正在检查初始化状态...</p>
        {:else}
          <form class="space-y-3" onsubmit={handleSubmit}>
            <div>
              <label class="auth-label" for="setup-username">管理员账号</label>
              <input
                id="setup-username"
                class="auth-input"
                type="text"
                bind:value={username}
                autocomplete="username"
                placeholder="请输入管理员用户名"
              />
            </div>
            <div>
              <label class="auth-label" for="setup-password">管理员密码</label>
              <input
                id="setup-password"
                class="auth-input"
                type="password"
                bind:value={password}
                autocomplete="new-password"
                placeholder="请输入管理员密码（至少8位）"
              />
            </div>
            <div>
              <label class="auth-label" for="setup-confirm-password">确认密码</label>
              <input
                id="setup-confirm-password"
                class="auth-input"
                type="password"
                bind:value={confirmPassword}
                autocomplete="new-password"
                placeholder="请再次输入管理员密码"
              />
            </div>

            {#if errorMsg}
              <p class="text-sm text-red-500">{errorMsg}</p>
            {/if}
            {#if successMsg}
              <p class="text-sm text-emerald-600">{successMsg}</p>
            {/if}

            <div class="auth-actions">
              <button
                class="w-full rounded-none border border-gray-300 bg-white text-black h-10 hover:bg-gray-100 disabled:opacity-60"
                type="submit"
                disabled={loading}
              >
                {loading ? '初始化中...' : '完成初始化'}
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  </div>
</div>
