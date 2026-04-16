<svelte:options runes={false} />

<script>
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { apiPut } from '$lib/api';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import {
    MODEL_OPTION_KEYS,
    parseOptionalNumberInput,
    stringifyNumberMap,
    prefillFromMapOrRow,
  } from '$lib/admin/modelPricingOptions.js';

  /** @type {boolean} */
  export let open = false;
  /** @type {any | null} */
  export let model = null;
  /**
   * @type {Record<string, Record<string, number>>}
   */
  export let optionMaps = {};

  /** @type {() => void | Promise<void>} */
  export let onSaved = () => {};

  let submitting = false;
  let initKey = '';
  /** @type {Record<string, string>} */
  let mapSnap = {};

  let inputUsdPerMStr = '';
  let outputUsdPerMStr = '';
  let cacheReadUsdPerMStr = '';
  let perCallUsdStr = '';
  /** 模型溢价倍率，留空表示 1 */
  let premiumRatioStr = '';

  function captureSnap() {
    /** @type {Record<string, string>} */
    const s = {};
    for (const k of MODEL_OPTION_KEYS) {
      s[k] = JSON.stringify(optionMaps[k] ?? {});
    }
    mapSnap = s;
  }

  function fillFields() {
    if (!model?.model_name) return;
    const name = model.model_name;
    inputUsdPerMStr = prefillFromMapOrRow(
      optionMaps.ModelInputUSDPerM ?? {},
      name,
      model.input_usd_per_m,
    );
    outputUsdPerMStr = prefillFromMapOrRow(
      optionMaps.ModelOutputUSDPerM ?? {},
      name,
      model.output_usd_per_m,
    );
    cacheReadUsdPerMStr = prefillFromMapOrRow(
      optionMaps.ModelCacheReadUSDPerM ?? {},
      name,
      model.cache_read_usd_per_m,
    );
    perCallUsdStr = prefillFromMapOrRow(
      optionMaps.ModelPerCallUSD ?? {},
      name,
      model.per_call_usd,
    );
    premiumRatioStr = prefillFromMapOrRow(optionMaps.ModelPremiumRatio ?? {}, name, undefined);
  }

  $: if (open && model?.model_name && model.model_name !== initKey) {
    initKey = model.model_name;
    fillFields();
    captureSnap();
  }
  $: if (!open) {
    initKey = '';
  }

  function close() {
    open = false;
  }

  /**
   * @param {Record<string, number>} map
   * @param {string} name
   * @param {{ ok: true, clear: true } | { ok: true, value: number }} p
   * @param {{ unsetZero?: boolean }} opts
   */
  function applyMapNumber(map, name, p, opts = {}) {
    if (p.clear) {
      delete map[name];
      return;
    }
    if (opts.unsetZero && p.value === 0) {
      delete map[name];
      return;
    }
    map[name] = p.value;
  }

  async function submit() {
    if (!model?.model_name) return;
    const name = model.model_name;

    for (const k of MODEL_OPTION_KEYS) {
      if (!optionMaps[k]) optionMaps[k] = {};
    }

    const mIn = optionMaps.ModelInputUSDPerM;
    const mOut = optionMaps.ModelOutputUSDPerM;
    const mCr = optionMaps.ModelCacheReadUSDPerM;
    const mPc = optionMaps.ModelPerCallUSD;
    const mPrem = optionMaps.ModelPremiumRatio;

    const pPc = parseOptionalNumberInput(perCallUsdStr);
    const pIn = parseOptionalNumberInput(inputUsdPerMStr);
    const pOut = parseOptionalNumberInput(outputUsdPerMStr);
    const pCr = parseOptionalNumberInput(cacheReadUsdPerMStr);
    const pPrem = parseOptionalNumberInput(premiumRatioStr);

    if (!pPc.ok) {
      showError(`按次价格: ${pPc.message}`);
      return;
    }
    if (!pIn.ok) {
      showError(`输入价: ${pIn.message}`);
      return;
    }
    if (!pOut.ok) {
      showError(`输出价: ${pOut.message}`);
      return;
    }
    if (!pCr.ok) {
      showError(`缓存命中价: ${pCr.message}`);
      return;
    }
    if (!pPrem.ok) {
      showError(`模型溢价倍率: ${pPrem.message}`);
      return;
    }

    if (!pPc.clear && pPc.value < 0) {
      showError('按次价格不能为负');
      return;
    }
    if (!pIn.clear && pIn.value < 0) {
      showError('输入价不能为负');
      return;
    }
    if (!pOut.clear && pOut.value < 0) {
      showError('输出价不能为负');
      return;
    }
    if (!pCr.clear && pCr.value < 0) {
      showError('缓存命中价不能为负');
      return;
    }
    if (!pPrem.clear && pPrem.value <= 0) {
      showError('模型溢价倍率须大于 0，或留空表示 1');
      return;
    }

    const perCallActive = !pPc.clear && pPc.value > 0;

    if (perCallActive) {
      mPc[name] = pPc.value;
      delete mIn[name];
      delete mOut[name];
      delete mCr[name];
    } else {
      applyMapNumber(mPc, name, pPc, { unsetZero: true });

      const tokenAllClear =
        (pIn.clear || pIn.value === 0) &&
        (pOut.clear || pOut.value === 0) &&
        (pCr.clear || pCr.value === 0);

      if (tokenAllClear) {
        delete mIn[name];
        delete mOut[name];
        delete mCr[name];
      } else {
        if (pIn.clear || pIn.value <= 0) {
          showError('按量计费须设置大于 0 的输入价（USD/1M），或全部留空以移除按量配置');
          return;
        }
        mIn[name] = pIn.value;
        applyMapNumber(mOut, name, pOut, { unsetZero: true });
        applyMapNumber(mCr, name, pCr, { unsetZero: true });
      }
    }

    if (pPrem.clear || pPrem.value === 1) {
      delete mPrem[name];
    } else {
      mPrem[name] = pPrem.value;
    }

    /** @type {string[]} */
    const toPut = [];
    for (const k of MODEL_OPTION_KEYS) {
      if (JSON.stringify(optionMaps[k] ?? {}) !== mapSnap[k]) {
        toPut.push(k);
      }
    }

    if (toPut.length === 0) {
      showSuccess('无变更');
      close();
      return;
    }

    submitting = true;
    try {
      for (const key of toPut) {
        const res = await apiPut('/api/option/', {
          key,
          value: stringifyNumberMap(optionMaps[key] ?? {}),
        });
        if (!res?.success) {
          showError(res?.message || `保存 ${key} 失败`);
          return;
        }
      }
      showSuccess('已保存');
      close();
      await Promise.resolve(onSaved());
    } catch (_) {
      showError('请求失败');
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>编辑模型定价</Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        {model?.model_name ? `模型：${model.model_name}` : ''}。美元标价为上游成本价；<strong>分组倍率</strong>与<strong>模型溢价倍率</strong>（默认 1，常见 1.0–1.1）在列表展示与扣费时连乘。填写<strong>按次价 &gt; 0</strong>时优先生效并清除该模型的按量三项。溢价留空或填 1 表示不额外溢价。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-3 py-2 text-sm">
      <div>
        <label class="auth-label" for="mp-premium">模型溢价倍率</label>
        <Input
          id="mp-premium"
          bind:value={premiumRatioStr}
          placeholder="默认 1（不填）；常见 1.05 表示加价 5%"
          class="font-mono text-xs"
        />
      </div>

      <div>
        <label class="auth-label" for="mp-per-call">按次价格（USD / 次）</label>
        <Input
          id="mp-per-call"
          bind:value={perCallUsdStr}
          placeholder="留空表示不按次；大于 0 覆盖按量"
          class="font-mono text-xs"
        />
      </div>

      <div class="space-y-3 border-t border-border pt-3">
        <p class="text-xs font-medium text-muted-foreground">按量（USD / 百万 tokens）</p>
        <div>
          <label class="auth-label" for="mp-in-usd">输入（prompt）</label>
          <Input
            id="mp-in-usd"
            bind:value={inputUsdPerMStr}
            placeholder="例如 0.15"
            class="font-mono text-xs"
          />
        </div>
        <div>
          <label class="auth-label" for="mp-out-usd">输出（completion）</label>
          <Input
            id="mp-out-usd"
            bind:value={outputUsdPerMStr}
            placeholder="留空则后端与输入同价"
            class="font-mono text-xs"
          />
        </div>
        <div>
          <label class="auth-label" for="mp-cr-usd">缓存命中（cache read）</label>
          <Input
            id="mp-cr-usd"
            bind:value={cacheReadUsdPerMStr}
            placeholder="留空则后端与输入同价"
            class="font-mono text-xs"
          />
        </div>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" type="button" onclick={close} disabled={submitting}>取消</Button>
      <Button type="button" disabled={submitting} onclick={submit}>
        {submitting ? '保存中…' : '保存'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
