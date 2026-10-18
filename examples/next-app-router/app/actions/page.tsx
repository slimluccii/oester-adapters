import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Greeter } from "./greeter";

async function remember(form: FormData) {
  "use server";
  (await cookies()).set("remembered", String(form.get("value")), { path: "/" });
  redirect("/actions");
}

export default async function Actions() {
  const remembered = (await cookies()).get("remembered")?.value ?? "nothing";
  return (
    <main>
      <p id="remembered">remembered: {remembered}</p>
      <form action={remember}>
        <input name="value" defaultValue="oyster" />
        <button type="submit">remember</button>
      </form>
      <Greeter />
    </main>
  );
}
