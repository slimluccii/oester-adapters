import notes from "#lib/notes.txt?url";
import { read } from "$app/server";

export function GET() {
  return read(notes);
}
