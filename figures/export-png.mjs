/**
 * 用项目已封装的 CDP 启动器把两张 SVG 导出成 PNG。
 *
 * 不走 `msedge --screenshot`：本机已有 Edge 实例时，命令行会被既有实例接管，
 * 进程静默退出且不产出文件（项目在浏览器差分那一轮已经踩过这个坑）。
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { findBrowserPath } from "../src/evidence/browser-probe.mjs";
import {
  launchCdpBrowser,
  openCdpSession,
} from "../src/evidence/cdp-client.mjs";

const figures = [
  {
    svg: "figures/R97-framework.svg",
    png: "figures/R97-framework.png",
    width: 1920,
    height: 1080,
  },
  {
    svg: "figures/R97-decision-flow.svg",
    png: "figures/R97-decision-flow.png",
    width: 1680,
    height: 1060,
  },
];

const profileDir = path.join(process.cwd(), ".runtime", "figure-profile");
const { child, wsUrl } = await launchCdpBrowser({
  browserPath: findBrowserPath(),
  profileDir,
});
const session = await openCdpSession({ wsUrl });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  for (const figure of figures) {
    const { targetId } = await session.send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await session.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await session.send("Page.enable", {}, sessionId);
    await session.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: figure.width,
        height: figure.height,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId,
    );
    await session.send(
      "Page.navigate",
      { url: pathToFileURL(path.resolve(figure.svg)).href },
      sessionId,
    );
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const probe = await session.send(
        "Runtime.evaluate",
        { expression: "document.readyState", returnByValue: true },
        sessionId,
      );
      if (probe.result?.value === "complete") break;
      await wait(150);
    }
    await wait(300);
    const shot = await session.send(
      "Page.captureScreenshot",
      {
        format: "png",
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: figure.width,
          height: figure.height,
          scale: 1,
        },
      },
      sessionId,
    );
    writeFileSync(figure.png, Buffer.from(shot.data, "base64"));
    console.log(`已导出 ${figure.png}`);
  }
} finally {
  session.close();
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
}
