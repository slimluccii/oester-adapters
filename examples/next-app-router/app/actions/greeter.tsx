"use client";

import { useState } from "react";
import { greet } from "./greet";

export function Greeter() {
  const [message, setMessage] = useState("");
  return (
    <button id="greet" onClick={async () => setMessage(await greet("oyster"))}>
      {message || "greet"}
    </button>
  );
}
