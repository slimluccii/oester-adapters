const posts: Record<string, string> = {
  "hello-world": "Hello, world",
  "second-post": "A second post",
};

export function entries() {
  return Object.keys(posts).map((slug) => ({ slug }));
}

export function load({ params }) {
  return { title: posts[params.slug] };
}
