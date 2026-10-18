import { draftMode } from "next/headers";

export const revalidate = 3600;

export default async function CachedPage() {
  const { isEnabled } = await draftMode();
  return (
    <main>
      <p id="stamp">stamp {Date.now()}</p>
      <p id="draft">draft: {String(isEnabled)}</p>
    </main>
  );
}
