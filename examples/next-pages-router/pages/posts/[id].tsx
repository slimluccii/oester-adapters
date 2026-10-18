import type { GetStaticPaths, GetStaticProps } from "next";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [{ params: { id: "1" } }],
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ id: string }> = async ({ params }) => ({
  props: { id: String(params?.id) },
});

export default function Post({ id }: { id: string }) {
  return <h1>Post {id}</h1>;
}
