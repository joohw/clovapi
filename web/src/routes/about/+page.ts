import { redirect } from '@sveltejs/kit';

/** 旧路径 /about 永久重定向到 /docs */
export function load() {
  redirect(301, '/docs');
}
