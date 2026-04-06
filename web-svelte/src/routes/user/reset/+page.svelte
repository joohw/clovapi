<svelte:options runes={false} />

<script>
  import { page } from '$app/state';
  import { apiPost } from '$lib/api';

  let loading = false;
  let errorMsg = '';
  let newPassword = '';

  $: email = page.url.searchParams.get('email') || '';
  $: token = page.url.searchParams.get('token') || '';
  $: isValidLink = Boolean(email && token);

  /**
   * @param {SubmitEvent} event
   */
  async function handleSubmit(event) {
    event.preventDefault();
    errorMsg = '';
    if (!isValidLink) {
      errorMsg = '无效的重置链接，请重新发起密码重置请求';
      return;
    }

    loading = true;
    try {
      const res = await apiPost('/api/user/reset', { email, token });
      if (res?.success) {
        newPassword = res?.data || '';
        if (newPassword) {
          await navigator.clipboard.writeText(newPassword);
        }
      } else {
        errorMsg = res?.message || '重置失败';
      }
    } catch (err) {
      errorMsg = '重置失败，请稍后重试';
    } finally {
      loading = false;
    }
  }

  async function copyPassword() {
    if (!newPassword) return;
    await navigator.clipboard.writeText(newPassword);
  }
</script>

<div class="auth-page">
  <div class="auth-shell">
    <div class="auth-card">
      <h1 class="auth-title">密码重置确认</h1>
      <div class="auth-body">
        {#if !isValidLink}
          <p class="mb-4 text-sm text-red-500">无效的重置链接，请重新发起密码重置请求</p>
        {/if}

        <form class="space-y-4" onsubmit={handleSubmit}>
          <div>
            <label class="auth-label" for="reset-confirm-email">邮箱</label>
            <input id="reset-confirm-email" class="auth-input" type="email" value={email} disabled />
          </div>

          {#if newPassword}
            <div>
              <label class="auth-label" for="reset-confirm-password">新密码</label>
              <div class="flex gap-2 items-center">
                <input id="reset-confirm-password" class="auth-input" type="text" value={newPassword} readonly />
                <button class="rounded-none border px-3 h-10 text-sm" type="button" onclick={copyPassword}>复制</button>
              </div>
            </div>
          {/if}

          {#if errorMsg}
            <p class="text-sm text-red-500">{errorMsg}</p>
          {/if}

          <div class="auth-actions">
            <button
              class="w-full rounded-none bg-black text-white h-10 disabled:opacity-60"
              type="submit"
              disabled={loading || !!newPassword || !isValidLink}
            >
              {newPassword ? '密码重置完成' : loading ? '处理中...' : '确认重置密码'}
            </button>
          </div>
        </form>

        <div class="mt-6 text-center text-sm">
          <a class="text-blue-600 hover:text-blue-800" href="/login">返回登录</a>
        </div>
      </div>
    </div>
  </div>
</div>
