<script setup lang="ts">
const route = useRoute();
</script>

<template>
  <h1>post {{ route.params.slug }}</h1>
</template>
