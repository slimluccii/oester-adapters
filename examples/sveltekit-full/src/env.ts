import { building } from "$app/env";
import { defineEnvVars } from "@sveltejs/kit/env";

// The variables exist only on Oester, not while building and prerendering.
const required = (value: string | undefined) => {
  if (value === undefined && !building) throw new Error("the variable is not set");
  return value ?? "";
};

export const variables = defineEnvVars({
  SECRET_MESSAGE: { schema: required },
  PUBLIC_GREETING: { public: true, schema: required },
});
