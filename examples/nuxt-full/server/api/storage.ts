export default defineEventHandler(async () => {
  const storage = useStorage("cache");
  const hits = ((await storage.getItem<number>("hits")) ?? 0) + 1;
  await storage.setItem("hits", hits);
  return { hits };
});
