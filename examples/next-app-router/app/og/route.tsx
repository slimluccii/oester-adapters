import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

export function GET() {
  return new ImageResponse(<div style={{ fontSize: 48, display: "flex" }}>Oester</div>, {
    width: 200,
    height: 100,
  });
}
