<svelte:options runes={false} />

<script>
  import { apiGet, apiPost } from '$lib/api';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import { renderQuota } from '$lib/dashboard/helpers.js';
  import { CalendarCheck, Gift, Check, CaretDown, CaretUp } from 'phosphor-svelte';
  import TurnstileWidget from './TurnstileWidget.svelte';
  import * as Dialog from '$lib/components/ui/dialog';

  /** @type {Record<string, any>} */
  export let status = {};
  export let turnstileEnabled = false;
  export let turnstileSiteKey = '';

  let loading = false;
  let checkinLoading = false;
  let turnstileModalVisible = false;
  let turnstileKey = 0;

  let checkinData = {
    enabled: false,
    stats: {
      checked_in_today: false,
      total_checkins: 0,
      total_quota: 0,
      checkin_count: 0,
      records: [],
    },
  };

  let viewDate = new Date();
  let initialLoaded = false;
  /** @type {boolean | null} */
  let isCollapsed = null;

  $: currentMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;

  $: checkinRecordsMap = (() => {
    const map = {};
    const records = checkinData.stats?.records || [];
    records.forEach((record) => {
      map[record.checkin_date] = record.quota_awarded;
    });
    return map;
  })();

  $: monthlyQuota = (checkinData.stats?.records || []).reduce(
    (sum, record) => sum + (record.quota_awarded || 0),
    0,
  );

  async function fetchCheckinStatus(month) {
    const isFirstLoad = !initialLoaded;
    loading = true;
    try {
      const res = await apiGet(`/api/user/checkin?month=${encodeURIComponent(month)}`);
      if (res?.success) {
        checkinData = res.data;
        if (isFirstLoad) {
          isCollapsed = res.data.stats?.checked_in_today ?? false;
          initialLoaded = true;
        }
      } else {
        showError(res?.message || '获取签到状态失败');
        if (isFirstLoad) {
          isCollapsed = false;
          initialLoaded = true;
        }
      }
    } catch (_) {
      showError('获取签到状态失败');
      if (isFirstLoad) {
        isCollapsed = false;
        initialLoaded = true;
      }
    } finally {
      loading = false;
    }
  }

  /**
   * @param {string} [token]
   */
  async function postCheckin(token) {
    const url = token
      ? `/api/user/checkin?turnstile=${encodeURIComponent(token)}`
      : '/api/user/checkin';
    return apiPost(url, {});
  }

  /**
   * @param {any} message
   */
  function shouldTriggerTurnstile(message) {
    if (!turnstileEnabled) return false;
    if (typeof message !== 'string') return true;
    return message.includes('Turnstile');
  }

  /**
   * @param {string} [token]
   */
  async function doCheckin(token) {
    checkinLoading = true;
    try {
      const res = await postCheckin(token);
      if (res?.success) {
        showSuccess('签到成功！获得 ' + renderQuota(res.data.quota_awarded));
        await fetchCheckinStatus(currentMonth);
        turnstileModalVisible = false;
      } else {
        const message = res?.message;
        if (!token && shouldTriggerTurnstile(message)) {
          if (!turnstileSiteKey) {
            showError('Turnstile is enabled but site key is empty.');
            return;
          }
          turnstileModalVisible = true;
          return;
        }
        if (token && shouldTriggerTurnstile(message)) {
          turnstileKey += 1;
        }
        showError(message || '签到失败');
      }
    } catch (_) {
      showError('签到失败');
    } finally {
      checkinLoading = false;
    }
  }

  function prevMonth() {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() - 1);
    viewDate = d;
  }

  function nextMonth() {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + 1);
    viewDate = d;
  }

  $: if (status?.checkin_enabled) {
    fetchCheckinStatus(currentMonth);
  }

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  /**
   * Build grid cells for month view
   * @param {Date} d
   */
  function buildMonthGrid(d) {
    const year = d.getFullYear();
    const month = d.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    /** @type {({ day: number; inMonth: boolean; dateStr: string } | null)[]} */
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let day = 1; day <= lastDay; day++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, inMonth: true, dateStr: ds });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  $: monthCells = buildMonthGrid(viewDate);
</script>

{#if status?.checkin_enabled}
  <div class="w-full min-w-0 rounded-2xl border border-gray-200 bg-card p-4 shadow-sm dark:border-zinc-700 md:p-6">
    <Dialog.Root bind:open={turnstileModalVisible}>
      <Dialog.Content class="max-w-md">
        <Dialog.Header>
          <Dialog.Title>Security Check</Dialog.Title>
        </Dialog.Header>
        <div class="flex justify-center py-2">
          {#key turnstileKey}
            <TurnstileWidget
              sitekey={turnstileSiteKey}
              onVerify={(t) => doCheckin(t)}
            />
          {/key}
        </div>
      </Dialog.Content>
    </Dialog.Root>

    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-pointer items-center text-left"
        on:click={() => (isCollapsed = !isCollapsed)}
      >
        <div
          class="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600/15 text-green-700 dark:text-green-400"
        >
          <CalendarCheck size={18} weight="duotone" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-lg font-medium">每日签到</span>
            {#if isCollapsed}
              <CaretDown size={16} class="text-muted-foreground" />
            {:else}
              <CaretUp size={16} class="text-muted-foreground" />
            {/if}
          </div>
          <div class="text-xs text-muted-foreground">
            {#if !initialLoaded}
              正在加载签到状态...
            {:else if checkinData.stats?.checked_in_today}
              今日已签到，累计签到 {checkinData.stats?.total_checkins || 0} 天
            {:else}
              每日签到可获得随机额度奖励
            {/if}
          </div>
        </div>
      </button>
      <button
        type="button"
        class="btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-none bg-green-700 px-3 py-2 text-sm text-white hover:bg-green-800 disabled:opacity-60"
        on:click={() => doCheckin()}
        disabled={checkinLoading || !initialLoaded || checkinData.stats?.checked_in_today}
      >
        <Gift size={16} />
        {#if !initialLoaded}
          加载中...
        {:else if checkinData.stats?.checked_in_today}
          今日已签到
        {:else}
          立即签到
        {/if}
      </button>
    </div>

    {#if isCollapsed === false}
      <div class="mt-4 space-y-4">
        <div class="grid grid-cols-3 gap-3">
          <div class="rounded-lg bg-muted/50 p-2.5 text-center">
            <div class="text-xl font-bold text-green-600">{checkinData.stats?.total_checkins || 0}</div>
            <div class="text-xs text-muted-foreground">累计签到</div>
          </div>
          <div class="rounded-lg bg-muted/50 p-2.5 text-center">
            <div class="text-xl font-bold text-orange-600">{renderQuota(monthlyQuota, 6)}</div>
            <div class="text-xs text-muted-foreground">本月获得</div>
          </div>
          <div class="rounded-lg bg-muted/50 p-2.5 text-center">
            <div class="text-xl font-bold text-blue-600">{renderQuota(checkinData.stats?.total_quota || 0, 6)}</div>
            <div class="text-xs text-muted-foreground">累计获得</div>
          </div>
        </div>

        <div class="overflow-hidden rounded-lg border border-border">
          <div class="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
            <button type="button" class="text-sm hover:underline" on:click={prevMonth}>←</button>
            <span class="text-sm font-medium"
              >{viewDate.getFullYear()} 年 {viewDate.getMonth() + 1} 月</span
            >
            <button type="button" class="text-sm hover:underline" on:click={nextMonth}>→</button>
          </div>
          {#if loading}
            <div class="p-6 text-center text-sm text-muted-foreground">加载中...</div>
          {:else}
            <div class="grid grid-cols-7 gap-px bg-border p-1 text-center text-[11px]">
              {#each weekdays as w}
                <div class="bg-muted/30 py-1 font-medium text-muted-foreground">{w}</div>
              {/each}
              {#each monthCells as cell}
                {#if cell === null}
                  <div class="min-h-[52px] bg-background"></div>
                {:else}
                  {@const q = checkinRecordsMap[cell.dateStr]}
                  <div
                    class="relative min-h-[52px] border border-transparent bg-background p-0.5 text-left"
                    title={q != null ? `获得 ${renderQuota(q)}` : ''}
                  >
                    <span class="absolute left-1 top-0.5 text-[11px] text-muted-foreground">{cell.day}</span>
                    {#if q != null}
                      <div class="flex h-full flex-col items-center justify-center pt-3">
                        <div
                          class="mb-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-green-600 shadow-sm"
                        >
                          <Check size={14} class="text-white" weight="bold" />
                        </div>
                        <div class="text-[10px] font-medium leading-none text-green-700 dark:text-green-400">
                          {renderQuota(q)}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>

        <div class="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <ul class="list-inside list-disc space-y-0.5">
            <li>每日签到可获得随机额度奖励</li>
            <li>签到奖励将直接添加到您的账户余额</li>
            <li>每日仅可签到一次，请勿重复签到</li>
          </ul>
        </div>
      </div>
    {/if}
  </div>
{/if}
