<svelte:options runes={false} />

<script>
  import { apiGet } from '$lib/api';

  let email = '';
  let loading = false;
  let successMsg = '';
  let errorMsg = '';

  /**
   * @param {SubmitEvent} event
   */
  async function handleSubmit(event) {
    event.preventDefault();
    successMsg = '';
    errorMsg = '';

    if (!email) {
      errorMsg = '请输入邮箱地址';
      return;
    }

    loading = true;
    try {
      const res = await apiGet(`/api/reset_password?email=${encodeURIComponent(email)}`);
      if (res?.success) {
        successMsg = '重置邮件已发送，请检查邮箱';
        email = '';
      } else {
        errorMsg = res?.message || '发送失败';
      }
    } catch (err) {
      errorMsg = '请求失败，请稍后重试';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-shell">
    <div class="auth-card">
      <h1 class="auth-title">密码重置</h1>
      <div class="auth-body">
        <form class="space-y-3" onsubmit={handleSubmit}>
          <div>
            <label class="auth-label" for="reset-email">邮箱</label>
            <input id="reset-email" class="auth-input" type="email" bind:value={email} autocomplete="email" placeholder="请输入邮箱地址" />
          </div>

          {#if errorMsg}
            <p class="text-sm text-red-500">{errorMsg}</p>
          {/if}
          {#if successMsg}
            <p class="text-sm text-green-600">{successMsg}</p>
          {/if}

          <div class="auth-actions">
            <button class="w-full rounded-none bg-black text-white h-10 disabled:opacity-60" type="submit" disabled={loading}>
              {loading ? '提交中...' : '提交'}
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
