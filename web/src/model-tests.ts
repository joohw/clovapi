import { useState } from 'react';
import { checked, useApp } from './context';
import type { ModelTestEntry } from './types';

const storageKey = 'clovapi-browser-model-tests';
export function useModelTests() {
  const { api, run, notify, tr, status } = useApp();
  const [tests, setTests] = useState<Record<string, ModelTestEntry>>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, ModelTestEntry>;
      return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry.status !== 'testing' && Date.now() - (entry.testedAt || 0) < 3 * 60 * 60 * 1000));
    } catch { return {}; }
  });
  const test = (provider: string, model: string) => run(`test:${provider}/${model}`, async () => {
    const key = `${provider}/${model}`;
    setTests(current => ({ ...current, [key]: { status: 'testing', summary: '', detail: '' } }));
    try {
      const result = checked(await api.profilesTest({ provider, model, proxy: { port: status.port } }));
      const entry: ModelTestEntry = { status: result.passed ? 'pass' : 'fail', summary: result.summary || result.error || tr('测试完成', 'Test complete'), detail: '', testedAt: Date.now() };
      setTests(current => { const next = { ...current, [key]: entry }; try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {} return next; });
      notify(`${model}: ${entry.summary}`, !result.passed);
    } catch (error) {
      setTests(current => ({ ...current, [key]: { status: 'fail', summary: String(error), detail: '', testedAt: Date.now() } }));
      throw error;
    }
  });
  return { tests, test };
}
