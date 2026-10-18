import type { GetServerSideProps } from "next";

type Props = { agent: string; secret: string; query: string };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, query }) => {
  res.setHeader("set-cookie", "visited=yes; Path=/");
  return {
    props: {
      agent: req.headers["user-agent"] ?? "",
      secret: process.env.SECRET_WORD ?? "",
      query: String(query.q ?? ""),
    },
  };
};

export default function Server({ agent, secret, query }: Props) {
  return (
    <main>
      <p id="agent">agent: {agent}</p>
      <p id="secret">secret: {secret}</p>
      <p id="query">query: {query}</p>
    </main>
  );
}
