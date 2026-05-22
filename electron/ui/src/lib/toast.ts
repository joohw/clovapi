import { toast as sonner } from "svelte-sonner";

/** 全局 Toast（svelte-sonner），在 App 中挂载 Toaster 后可用 */
export const toast = {
  message: (message: string) => sonner(message),
  success: (message: string) => sonner.success(message),
  error: (message: string) => sonner.error(message),
  info: (message: string) => sonner.info(message),
  warning: (message: string) => sonner.warning(message),
};
