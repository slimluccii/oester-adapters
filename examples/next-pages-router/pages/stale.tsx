import type { GetStaticProps } from "next";

export const getStaticProps: GetStaticProps<{ stamp: number }> = async () => ({
  props: { stamp: Date.now() },
  revalidate: 3600,
});

export default function Stale({ stamp }: { stamp: number }) {
  return <p id="stale">stamp {stamp}</p>;
}
