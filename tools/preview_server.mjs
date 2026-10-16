import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8089;
const HOST = "127.0.0.1";

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  let filePath = null;

  if (url === "/safety" || url === "/safety-utility") {
    filePath = path.join(process.cwd(), "datasets/benchmark-wechat-file-pro-v6/safety-utility.svg");
  } else {
    // 默认或 /framework: 显示重构后的终版科研架构图
    filePath = path.join(process.cwd(), "docs/r97_horizontal_framework.svg");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("File not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`R97 Interactive SVG Viewer running at http://${HOST}:${PORT}`);
});
