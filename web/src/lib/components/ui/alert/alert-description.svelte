<script>
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert-description"
	class={cn(
		"text-muted-foreground text-xs/relaxed text-balance md:text-pretty [&_p:not(:last-child)]:mb-2 [&_a]:hover:text-foreground [&_a]:underline [&_a]:underline-offset-3",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>