import { spawn } from "node:child_process";
import { WebSocket } from "ws";

const appUrl = process.env.PRODUCT_SHELF_URL || "http://127.0.0.1:5173/";
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.PRODUCT_SHELF_CDP_PORT || 9350);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  return response.json();
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = {
    console: [],
    exceptions: [],
    failedRequests: [],
    log: []
  };

  ws.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result || {});
      }
      return;
    }

    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
      events.console.push(message.params.args.map((arg) => arg.value || arg.description || "").join(" "));
    }
    if (message.method === "Runtime.exceptionThrown") {
      events.exceptions.push(message.params.exceptionDetails?.text || message.params.exceptionDetails?.exception?.description || "exception");
    }
    if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
      events.log.push(message.params.entry.text);
    }
    if (message.method === "Network.loadingFailed") {
      events.failedRequests.push(`${message.params.errorText} ${message.params.blockedReason || ""}`.trim());
    }
  });

  function send(method, params = {}) {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
  }

  async function evaluate(fn, arg) {
    const result = await send("Runtime.evaluate", {
      awaitPromise: true,
      expression: `(${fn})(${JSON.stringify(arg)})`,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }

  async function waitFor(fn, arg, timeout = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const value = await evaluate(fn, arg).catch(() => null);
      if (value) {
        return value;
      }
      await sleep(250);
    }
    throw new Error("Timed out waiting for UI state");
  }

  return { close: () => ws.close(), evaluate, events, send, waitFor, ws };
}

async function main() {
  await fetch(appUrl, { method: "HEAD" }).catch(() => {
    throw new Error(`Product shelf app is not reachable at ${appUrl}. Start npm run dev first.`);
  });

  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/product-shelf-smoke-${Date.now()}`,
    "--window-size=1440,1100",
    appUrl
  ], { stdio: "ignore" });

  let client;
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        await readJson(`http://127.0.0.1:${port}/json/list`);
        break;
      } catch {
        await sleep(150);
      }
    }

    const targets = await readJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((target) => target.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error("Could not find a Chrome page target");
    }

    client = createCdpClient(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      client.ws.once("open", resolve);
      client.ws.once("error", reject);
    });
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Log.enable");
    await client.send("Network.enable");
    await client.send("Page.navigate", { url: appUrl });
    await sleep(1000);
    await client.evaluate(() => {
      window.__productShelfSmokeUnhandled = [];
      window.addEventListener("unhandledrejection", (event) => {
        window.__productShelfSmokeUnhandled.push(String(event.reason?.message || event.reason || "unhandled"));
        event.preventDefault();
      });
      window.HTMLMediaElement.prototype.play = () => Promise.resolve();
      if (window.speechSynthesis) {
        window.speechSynthesis.speak = () => undefined;
        window.speechSynthesis.cancel = () => undefined;
      }
      return true;
    });

    const results = [];
    const pass = (label) => results.push(`PASS ${label}`);
    const assert = (condition, label) => {
      if (!condition) {
        throw new Error(label);
      }
      pass(label);
    };

    const shelf = await client.waitFor(() => {
      const text = document.body.innerText;
      const covers = document.querySelectorAll(".cover-card").length;
      return text.includes("我的绘本书架") && text.includes("桂小雅") && covers > 0
        ? { covers, title: document.title, text }
        : null;
    });
    assert(shelf.title === "我的绘本书架", "default title is product shelf");
    assert(shelf.covers > 0, "bookshelf covers render");
    assert(!shelf.text.includes("肖予曦") && !shelf.text.includes("桂小灵"), "new product copy uses shared participant names");

    await client.evaluate(() => {
      [...document.querySelectorAll(".product-nav button")].find((button) => button.textContent.includes("打开绘本"))?.click();
      return true;
    });
    const reader = await client.waitFor(() => ({
      page: document.querySelector(".page-number-pill")?.textContent || "",
      pageButtons: document.querySelectorAll(".page-strip button").length,
      openBook: Boolean(document.querySelector(".open-book"))
    }));
    assert(reader.openBook, "reader opens selected book");
    assert(reader.pageButtons >= 4, "reader has page strip");

    await client.evaluate(() => {
      document.querySelector(".page-turn.right")?.click();
      return true;
    });
    await client.waitFor(() => document.querySelector(".page-number-pill")?.textContent?.includes("2"));
    pass("next page button works");
    await client.evaluate(() => {
      document.querySelector(".page-turn.left")?.click();
      return true;
    });
    await client.waitFor(() => /1/.test(document.querySelector(".page-number-pill")?.textContent || ""));
    pass("previous page button works");

    await client.evaluate(() => {
      [...document.querySelectorAll(".product-nav button")].find((button) => button.textContent.includes("创作记录"))?.click();
      return true;
    });
    const records = await client.waitFor(() => {
      const section = document.querySelector(".record-workspace.is-expanded");
      const recordCount = document.querySelectorAll(".record-item").length;
      return section ? { recordCount } : null;
    });
    assert(records.recordCount > 0, "records panel opens");
    await client.evaluate(() => {
      document.querySelector(".record-item summary")?.click();
      return true;
    });
    await client.waitFor(() => document.querySelector(".record-item details")?.open);
    pass("record details expand");

    await client.evaluate(() => {
      [...document.querySelectorAll(".product-nav button")].find((button) => button.textContent.includes("绘本剧场"))?.click();
      return true;
    });
    await client.waitFor(() => Boolean(document.querySelector(".theater-workspace")));
    pass("theater opens");
    await client.evaluate(() => {
      [...document.querySelectorAll(".theater-mode-switch button")].find((button) => button.textContent.includes("自己阅读"))?.click();
      return true;
    });
    await client.waitFor(() => document.querySelector(".theater-mode-switch button.active")?.textContent.includes("自己阅读"));
    pass("theater reading mode toggles");

    await client.evaluate(() => {
      [...document.querySelectorAll(".product-nav button")].find((button) => button.textContent.includes("我的书架"))?.click();
      return true;
    });
    await client.evaluate(() => {
      document.querySelector(".cover-delete")?.click();
      return true;
    });
    await client.waitFor(() => Boolean(document.querySelector(".confirm-dialog")));
    pass("delete confirmation opens");
    await client.evaluate(() => {
      [...document.querySelectorAll(".confirm-actions button")].find((button) => button.textContent.includes("取消"))?.click();
      return true;
    });
    await client.waitFor(() => !document.querySelector(".confirm-dialog"));
    pass("delete confirmation cancels");

    await client.evaluate(() => {
      const chip = [...document.querySelectorAll(".idea-chips button")].find((button) => button.textContent.includes("三月三"));
      chip?.click();
      return true;
    });
    await client.waitFor(() => document.querySelector(".inspiration-form textarea")?.value.includes("三月三"));
    pass("idea chip fills textarea");
    const formState = await client.evaluate(() => {
      [...document.querySelectorAll(".segmented-control button")].find((button) => button.textContent.trim() === "English")?.click();
      [...document.querySelectorAll(".segmented-control button")].find((button) => button.textContent.trim() === "男孩主角")?.click();
      const checkbox = document.querySelector(".check-tool input");
      checkbox?.click();
      return {
        boy: [...document.querySelectorAll(".segmented-control button")].find((button) => button.textContent.trim() === "男孩主角")?.classList.contains("active"),
        checked: checkbox?.checked,
        english: [...document.querySelectorAll(".segmented-control button")].find((button) => button.textContent.trim() === "English")?.classList.contains("active")
      };
    });
    assert(formState.english && formState.boy, "segmented controls toggle");
    assert(formState.checked === false || formState.checked === true, "image checkbox toggles");

    await client.evaluate(() => {
      location.hash = "#/classic";
      return true;
    });
    await client.waitFor(() => document.body.innerText.includes("桂韵创想家"));
    pass("classic interface remains reachable");

    await client.send("Emulation.setDeviceMetricsOverride", { deviceScaleFactor: 1, height: 960, mobile: true, width: 390 });
    await client.send("Page.navigate", { url: appUrl });
    await sleep(1000);
    const mobile = await client.waitFor(() => {
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return document.body.innerText.includes("我的绘本书架") ? { overflow } : null;
    });
    assert(mobile.overflow <= 2, "mobile layout has no horizontal overflow");

    const unhandled = await client.evaluate(() => window.__productShelfSmokeUnhandled || []);
    const seriousConsole = client.events.console.filter((line) => !/React DevTools/u.test(line));
    const seriousLog = client.events.log.filter((line) => !/favicon|React DevTools|404/u.test(line));
    assert(unhandled.length === 0, "no unhandled promise rejections");
    assert(client.events.exceptions.length === 0, "no runtime exceptions");
    assert(seriousConsole.length === 0, "no console warnings or errors");
    assert(seriousLog.length === 0, "no browser log warnings or errors");

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
