<script lang="ts">
  let { data } = $props();
</script>

<p id="hello">{data.hello.message} via {data.hello.via}</p>
