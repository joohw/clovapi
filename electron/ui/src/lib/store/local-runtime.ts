import { store } from "./state.svelte";

export function setRunning(running: boolean) {
  store.running = Boolean(running);
}

export async function detectOllamaInstalled() {
  const bridge = window.clovapiCli;
  if (!bridge?.which) {
    store.ollamaInstalled = false;
    return;
  }
  try {
    const result = await bridge.which("ollama");
    store.ollamaInstalled = Boolean(result?.exists || result?.path);
  } catch {
    store.ollamaInstalled = false;
  }
}
