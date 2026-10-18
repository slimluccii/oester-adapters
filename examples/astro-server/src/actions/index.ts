import { defineAction } from "astro:actions";
import { z } from "astro/zod";

export const server = {
  greet: defineAction({
    accept: "form",
    input: z.object({ name: z.string().min(1) }),
    handler: async ({ name }) => ({ greeting: `Hello, ${name}!` }),
  }),
  add: defineAction({
    input: z.object({ a: z.number(), b: z.number() }),
    handler: async ({ a, b }) => ({ sum: a + b }),
  }),
};
