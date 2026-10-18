import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { echo, getGreeting } from "../server-fns";

export const Route = createFileRoute("/")({
  loader: () => getGreeting(),
  component: Home,
});

function Home() {
  const { greeting, visitor } = Route.useLoaderData();
  const [echoed, setEchoed] = useState("");
  return (
    <main>
      <h1>Greeting: {greeting}</h1>
      <p>Visitor: {visitor}</p>
      <button onClick={async () => setEchoed((await echo({ data: { message: "hi" } })).echoed)}>
        Echo
      </button>
      <output>{echoed}</output>
    </main>
  );
}
