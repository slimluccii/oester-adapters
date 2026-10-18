<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; message: string } }>();
</script>

<template>
  <h1>nuxt-full error {{ props.error.statusCode }}</h1>
</template>
