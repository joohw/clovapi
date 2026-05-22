declare module "*.svelte" {
  import type { Component } from "svelte";

  const component: Component<any>;
  export const badgeVariants: any;
  export const buttonVariants: any;
  export const tabsListVariants: any;
  export type BadgeVariant = any;
  export type ButtonProps = any;
  export type ButtonSize = any;
  export type ButtonVariant = any;
  export type TabsListVariant = any;
  export default component;
}
