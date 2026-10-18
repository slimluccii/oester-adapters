import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/about", permanent: false },
});

export default function GoAway() {
  return null;
}
