export async function load({ fetch }) {
  const robots = await fetch("/robots.txt").then((r) => r.text());
  return { robots };
}
