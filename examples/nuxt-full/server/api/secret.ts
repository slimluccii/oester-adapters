export default defineEventHandler(() => ({ secret: useRuntimeConfig().apiSecret }));
