<script setup lang="ts">
const route = useRoute();
const config = useRuntimeConfig();
const url = useRequestURL();
const { data } = await useFetch("/api/secret");
const counter = useState("counter", () => 41);
counter.value++;
</script>

<template>
  <p id="path">path={{ route.path }} q={{ route.query.q }}</p>
  <p id="url">protocol={{ url.protocol }}</p>
  <p id="public">public={{ config.public.greeting }}</p>
  <p id="secret">secret={{ data?.secret }}</p>
  <p id="state">state={{ counter }}</p>
</template>
