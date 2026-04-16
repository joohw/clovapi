<svelte:options runes={false} />

<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { apiPost } from '$lib/api';

  let username = '';
  let password = '';
  let password2 = '';
  let email = '';
  let affCode = '';
  let affCodeFromQuery = false;
  let loading = false;
  let errorMsg = '';

  $: {
    const queryAff =
      $page.url.searchParams.get('aff') ||
      $page.url.searchParams.get('aff_code') ||
      $page.url.searchParams.get('invite_code') ||
      '';
    if (queryAff && !affCode) {
      affCode = queryAff;
      affCodeFromQuery = true;
    }
  }

  /**
   * @param {SubmitEvent} event
   */
  async function handleSubmit(event) {
    event.preventDefault();
    errorMsg = '';

    if (!username || !password || !password2) {
      errorMsg = '请填写完整信息';
      return;
    }
    if (password.length < 8) {
      errorMsg = '密码长度不得小于 8 位';
      return;
    }
    if (password !== password2) {
      errorMsg = '两次输入的密码不一致';
      return;
    }

    loading = true;
    try {
      /** @type {Record<string, unknown>} */
      const payload = { username, password, password2 };
      if (email) {
        payload.email = email;
      }
      if (affCode) {
        payload.aff_code = affCode.trim();
      }
      const res = await apiPost('/api/user/register', payload);
      if (res?.success) {
        goto('/login');
      } else {
        errorMsg = res?.message || '注册失败';
      }
    } catch (err) {
      errorMsg = '注册失败，请稍后重试';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-shell">
    <div class="auth-card">
      <h1 class="auth-title">注册</h1>
      <div class="auth-body">
        <form class="space-y-3" onsubmit={handleSubmit}>
          <div>
            <label class="auth-label" for="register-username">用户名</label>
            <input id="register-username" class="auth-input" type="text" bind:value={username} autocomplete="username" placeholder="请输入用户名" />
          </div>
          <div>
            <label class="auth-label" for="register-email">邮箱（可选）</label>
            <input id="register-email" class="auth-input" type="email" bind:value={email} autocomplete="email" placeholder="请输入邮箱地址" />
          </div>
          <div>
            <label class="auth-label" for="register-aff-code">邀请码（可选）</label>
            <input
              id="register-aff-code"
              class="auth-input"
              type="text"
              bind:value={affCode}
              autocomplete="off"
              disabled={affCodeFromQuery}
              placeholder="请输入邀请码"
            />
          </div>
          <div>
            <label class="auth-label" for="register-password">密码</label>
            <input id="register-password" class="auth-input" type="password" bind:value={password} autocomplete="new-password" placeholder="输入密码，最短 8 位" />
          </div>
          <div>
            <label class="auth-label" for="register-password2">确认密码</label>
            <input id="register-password2" class="auth-input" type="password" bind:value={password2} autocomplete="new-password" placeholder="再次输入密码" />
          </div>

          {#if errorMsg}
            <p class="text-sm text-red-500">{errorMsg}</p>
          {/if}

          <div class="auth-actions">
            <button
              class="w-full rounded-none border border-gray-300 bg-white text-black h-10 hover:bg-gray-100 disabled:opacity-60"
              type="submit"
              disabled={loading}
            >
              {loading ? '注册中...' : '注册'}
            </button>
          </div>
        </form>

        <div class="mt-6 text-center text-sm">
          <a class="text-blue-600 hover:text-blue-800" href="/login">已有账户？去登录</a>
        </div>
      </div>
    </div>
  </div>
</div>
