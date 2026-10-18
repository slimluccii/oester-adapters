import type { Reroute } from "@sveltejs/kit/hooks";

export const reroute: Reroute = ({ url }) => {
  if (url.pathname === "/rerouted") return "/ssr";
};
