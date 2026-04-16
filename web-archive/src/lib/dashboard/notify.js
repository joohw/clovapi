import { writable } from 'svelte/store';

/** @type {import('svelte/store').Writable<{ type: string; message: string } | null>} */
export const toastStore = writable(null);

let tid = 0;

/**
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {string} message
 * @param {number} [ms]
 */
function push(type, message, ms = 3200) {
  toastStore.set({ type, message });
  clearTimeout(tid);
  tid = setTimeout(() => toastStore.set(null), ms);
}

/** @param {string} message */
export function showSuccess(message) {
  push('success', message);
}

/** @param {string} message */
export function showError(message) {
  push('error', message, 5000);
}

/** @param {string} message */
export function showInfo(message) {
  push('info', message);
}

/** @param {string} message */
export function showWarning(message) {
  push('warning', message, 4500);
}
