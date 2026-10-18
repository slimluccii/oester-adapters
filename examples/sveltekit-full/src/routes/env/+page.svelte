<script lang="ts">
  import { PUBLIC_GREETING } from "$app/env/public";

  let { data } = $props();
</script>

<p id="public">{PUBLIC_GREETING}</p>
<p id="legacy">{data.legacy}</p>
