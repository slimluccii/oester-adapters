export const prerender = "auto";

export function entries() {
  return [{ slug: "first" }];
}

export function load({ params }) {
  return { slug: params.slug, at: Date.now() };
}
