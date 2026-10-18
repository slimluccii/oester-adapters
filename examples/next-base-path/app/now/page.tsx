import { headers } from "next/headers";

export default async function Now() {
  const host = (await headers()).get("host");
  return <p id="now">rendered for {host}</p>;
}
