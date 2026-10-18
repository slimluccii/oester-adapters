<script lang="ts">
  import { enhance } from "$app/forms";

  let { data, form } = $props();
</script>

<form method="POST" action="?/greet" use:enhance>
  <input name="name" />
  <button>Greet</button>
</form>
<form method="POST" action="?/leave"><button>Leave</button></form>
{#if form?.greeting}<p id="greeting">{form.greeting}</p>{/if}
{#if form?.missing}<p id="missing">Name is missing</p>{/if}
<p id="name">{data.name}</p>
