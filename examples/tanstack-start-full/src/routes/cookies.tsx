import { createFileRoute, useRouter } from "@tanstack/react-router";
import { getTheme, setTheme } from "../server-fns";

export const Route = createFileRoute("/cookies")({
  loader: () => getTheme(),
  component: Cookies,
});

function Cookies() {
  const theme = Route.useLoaderData();
  const router = useRouter();
  return (
    <main>
      <p>Theme: {theme}</p>
      <button
        onClick={async () => {
          await setTheme({ data: theme === "dark" ? "light" : "dark" });
          await router.invalidate();
        }}
      >
        Toggle
      </button>
    </main>
  );
}
