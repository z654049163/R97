/**
 * 启动微信开发者工具的自动化端口（不采集，只把工具拉起来）。
 *
 * 用与 `wechat-devtools.mjs` 相同的调用方式：`cli.bat auto --project <p>
 * --auto-port <port> --trust-project`。`windowsHide` 与项目既有代码一致。
 */
import { spawn } from "node:child_process";
import path from "node:path";

const cliPath = process.env.R97_WECHAT_CLI_PATH ?? "E:\\微信开发者工具\\cli.bat";
const projectPath = path.resolve(process.argv[2] ?? "fixtures/wechat-miniapp");
const port = Number.parseInt(process.argv[3] ?? "9421", 10);

const child = spawn(
  process.env.ComSpec ?? "cmd.exe",
  [
    "/c",
    cliPath,
    "auto",
    "--project",
    projectPath,
    "--auto-port",
    String(port),
    "--trust-project",
  ],
  // 捕获输出：`auto` 失败时会打印原因，之前用 ignore 什么都看不到。
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
child.stdout.on("data", (chunk) => {
  process.stdout.write("[cli] " + chunk.toString().trim() + "\n");
});
child.stderr.on("data", (chunk) => {
  process.stdout.write("[cli:err] " + chunk.toString().trim() + "\n");
});
child.on("error", (error) => {
  console.error("启动失败:", error.message);
});

console.log(
  `已请求启动开发者工具：project=${projectPath} port=${port} pid=${child.pid}`,
);
console.log(
  "该进程需要保持运行（cli auto 一退出，开发者工具的自动化会话就结束）。",
);
console.log("等待约 25 秒后可以连接该端口。");
