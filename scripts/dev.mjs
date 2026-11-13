// 서버와 편집기 개발 서버를 함께 띄운다.
import { spawn } from "node:child_process";

const procs = [
  spawn("pnpm", ["--filter", "@age/server", "dev"], { stdio: "inherit", shell: true }),
  spawn("pnpm", ["--filter", "@age/editor", "dev"], { stdio: "inherit", shell: true }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", (code) => { stop(); process.exit(code ?? 0); }));
