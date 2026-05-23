import { toast as sonner } from "svelte-sonner";

type ToastOptions = { id?: string | number };

/** 全局 Toast（svelte-sonner），在 App 中挂载 Toaster 后可用 */
export const toast = {
  message: (message: string, options?: ToastOptions) => sonner(message, options),
  success: (message: string, options?: ToastOptions) => sonner.success(message, options),
  error: (message: string, options?: ToastOptions) => sonner.error(message, options),
  info: (message: string, options?: ToastOptions) => sonner.info(message, options),
  warning: (message: string, options?: ToastOptions) => sonner.warning(message, options),
  loading: (message: string, options?: ToastOptions) => sonner.loading(message, options),
  dismiss: (id?: string | number) => sonner.dismiss(id),
};
