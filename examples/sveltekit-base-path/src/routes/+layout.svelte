<script lang="ts">
  import { resolve } from "$app/paths";

  let { children } = $props();
</script>

<nav>
  <a href={resolve("/")}>Docs</a>
  <a href={resolve("/guide")}>Guide</a>
  <a href={resolve("/old")}>Old</a>
  <a href={resolve("/live")}>Live</a>
</nav>
{@render children()}
