import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("production excludes demo credentials even with the flag true; dev/preview remain loopback", async () => {
  // Separate production process: Vitest sets NODE_ENV=test, which otherwise
  // makes Vite preserve development branches in a programmatic build.
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
    import { build } from 'vite';
    import react from '@vitejs/plugin-react';
    import tailwindcss from '@tailwindcss/vite';
    const result = await build({ configFile: false, envFile: false, plugins: [react(), tailwindcss()],
    define: { "import.meta.env.VITE_DEMO_MODE": JSON.stringify("true"), "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("") },
    logLevel: "silent", build: { write: false } });
    const output = result.output.filter(o => o.type === 'chunk').map(o => o.code).join('\\n');
    process.stdout.write(JSON.stringify(['password123', 'admin@insync.ph', 'andrea@intern.ph', 'instructor@bsu.edu.ph'].map(value => output.includes(value))));
  `], { env: { ...process.env, NODE_ENV: "production" }, windowsHide: true, timeout: 45000 });
  expect(JSON.parse(stdout)).toEqual([false, false, false, false]);
  const { default: config } = await import("../vite.config.js");
  expect(config.server.host).toBe("127.0.0.1");
  expect(config.preview.host).toBe("127.0.0.1");
  expect(JSON.parse(readFileSync("package.json", "utf8")).scripts.dev).toBe("vite");
}, 60000);
