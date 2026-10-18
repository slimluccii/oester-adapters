<script setup lang="ts">
const visits = useCookie<number>("visits", { default: () => 0 });
visits.value = Number(visits.value) + 1;
</script>

<template>
  <p>visits={{ visits }}</p>
</template>
