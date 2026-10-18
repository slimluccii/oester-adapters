import type { GetStaticProps } from "next";

export const getStaticProps: GetStaticProps<{ builtAt: number }> = async () => ({
  props: { builtAt: Date.now() },
});

export default function About({ builtAt }: { builtAt: number }) {
  return <p id="about">about, built at {builtAt}</p>;
}
