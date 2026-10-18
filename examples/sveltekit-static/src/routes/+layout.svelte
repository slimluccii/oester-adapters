<script lang="ts">
  import { PUBLIC_SITE_NAME } from "$app/env/public";

  let { children } = $props();
</script>

<header id="site">{PUBLIC_SITE_NAME}</header>
<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/blog/hello-world">Hello world</a>
  <a href="/moved">Moved</a>
  <a href="/feed.json">Feed</a>
</nav>
{@render children()}
