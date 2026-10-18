import type { GetStaticProps } from "next";

export const getStaticProps: GetStaticProps<{ renderedAt: number }> = async () => ({
  props: { renderedAt: Date.now() },
  revalidate: 1,
});

export default function Fresh({ renderedAt }: { renderedAt: number }) {
  return <p id="fresh">rendered at {renderedAt}</p>;
}
