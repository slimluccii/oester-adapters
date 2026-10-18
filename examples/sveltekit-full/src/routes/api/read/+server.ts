import data from "#lib/data.txt?url";
import { read } from "$app/server";

export function GET() {
  return read(data);
}
