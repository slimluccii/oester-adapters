import type { GetStaticPaths, GetStaticProps } from "next";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [{ params: { slug: "known" } }],
  fallback: "blocking",
});

export const getStaticProps: GetStaticProps<{ slug: string }> = async ({ params }) => {
  if (params?.slug === "hidden") return { notFound: true };
  return { props: { slug: String(params?.slug) } };
};

export default function Product({ slug }: { slug: string }) {
  return <h1>Product {slug}</h1>;
}
