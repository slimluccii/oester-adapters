export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("request", (event) => {
    event.context.plugin = "loaded";
  });
});
