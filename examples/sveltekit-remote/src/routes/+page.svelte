<script lang="ts">
  import { buildInfo, double, getGreeting, setName, ticks } from "./data.remote";
</script>

<p id="greeting">{await getGreeting()}</p>
<p id="double">{await double(21)}</p>
<p id="tick">{await ticks()}</p>
<p id="build">{await buildInfo()}</p>

<form {...setName}>
  <input {...setName.fields.name.as("text")} />
  <button>Save</button>
</form>
