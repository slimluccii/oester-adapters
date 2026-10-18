import type { Platform as OesterPlatform } from "@oester/sveltekit";

declare global {
  namespace App {
    interface Error {
      errorId?: string;
    }
    interface Locals {
      requestId: string;
    }
    interface Platform {
      env: OesterPlatform["env"];
      ctx: OesterPlatform["ctx"];
    }
  }
}

export {};
