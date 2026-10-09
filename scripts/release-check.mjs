import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.npm_execpath) throw new Error("Run this with npm run verify:release.");
const cwd = fileURLToPath(new URL("../",import.meta.url));
for (const args of [["test"],["run","lint"],["run","build"],["audit","--ignore-scripts","--json"]]) {
  execFileSync(process.execPath,[process.env.npm_execpath,...args],{cwd,stdio:"inherit",windowsHide:true});
}
execFileSync("git",["diff","--check"],{cwd,stdio:"inherit",windowsHide:true});
console.log("Local release checks passed. Provider/browser checks and deployment remain separate.");
