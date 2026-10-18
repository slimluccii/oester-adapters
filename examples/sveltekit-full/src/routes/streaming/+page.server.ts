export function load() {
  return {
    fast: "fast value",
    slow: new Promise<string>((resolve) => setTimeout(() => resolve("slow value"), 1500)),
  };
}
