import { state } from "#lib/server/state.ts";

export function GET() {
  return Response.json({
    init: state.initialized,
    instrumentation: (globalThis as { instrumented?: boolean }).instrumented === true,
  });
}
