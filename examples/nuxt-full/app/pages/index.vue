<script setup lang="ts">
const count = ref(0);
</script>

<template>
  <h1>nuxt-full home</h1>
  <button @click="count++">clicked {{ count }}</button>
  <NuxtLink to="/about">about</NuxtLink>
</template>
