<script lang="ts">
  let { data } = $props();
</script>

<p id="fast">{data.fast}</p>
{#await data.slow}
  <p id="pending">loading</p>
{:then value}
  <p id="slow">{value}</p>
{/await}
