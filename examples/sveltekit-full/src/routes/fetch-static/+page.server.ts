export async function load({ fetch }) {
  const robots = await fetch("/robots.txt").then((r) => r.text());
  const prerendered = await fetch("/prerendered.json").then((r) => r.json());
  return { robots, prerendered: prerendered.prerendered };
}
