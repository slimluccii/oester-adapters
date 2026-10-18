<script lang="ts">
  let { children } = $props();
</script>

<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/ssr">SSR</a>
  <a href="/form">Form</a>
  <a href="/streaming">Streaming</a>
</nav>

{@render children()}
