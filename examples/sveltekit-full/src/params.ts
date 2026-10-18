import { defineParams } from "@sveltejs/kit/params";

export const params = defineParams({
  integer: (param) => (/^\d+$/.test(param) ? Number(param) : undefined),
});
