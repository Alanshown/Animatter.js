import { spawn } from "node:child_process";
export const base = "http://127.0.0.1:4173";
export async function startServer() {
  try {
    const r = await fetch(base + "/tests/fixtures/runtime.html");
    if (r.ok) return () => {};
  } catch {
    /* start local fixture server */
  }
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (d) => {
    output += d;
  });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + "/tests/fixtures/runtime.html");
      if (r.ok) return () => child.kill();
    } catch {
      /* await startup */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill();
  throw Error("Local server did not start: " + output);
}
