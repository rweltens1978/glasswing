import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  CdpError,
  createTarget,
  evaluate,
  fetchJson,
  getVersion,
  isPortReady,
  listTargets,
  waitForLoad,
  waitForPort,
  withPage
} from "./cdp.js";

export const defaults = {
  host: "127.0.0.1",
  port: Number(process.env.GLASSWING_PORT || 9223),
  profile: process.env.GLASSWING_PROFILE || "/tmp/glasswing-chrome",
  chrome: process.env.GLASSWING_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
};

export function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function commonOptions(args) {
  return {
    host: args.host || defaults.host,
    port: Number(args.port || defaults.port),
    match: args.match || undefined
  };
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function launch(args) {
  const port = Number(args.port || defaults.port);
  const host = args.host || defaults.host;
  const profile = resolve(args.profile || defaults.profile);
  const chrome = args.chrome || defaults.chrome;
  const url = args.url || "about:blank";

  if (await isPortReady(port, host)) {
    const version = await getVersion(port, host);
    printJson({ status: "already-running", port, browser: version.Browser, profile });
    return;
  }

  if (!existsSync(chrome)) {
    throw new CdpError(`Chrome executable not found at ${chrome}`);
  }
  mkdirSync(profile, { recursive: true });

  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=DialMediaRouteProvider",
    url
  ];

  const child = spawn(chrome, chromeArgs, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  await waitForPort(port, { host, timeoutMs: Number(args.timeout || 15000) });
  const version = await getVersion(port, host);
  printJson({ status: "launched", pid: child.pid, port, browser: version.Browser, profile, url });
}

export async function doctor(args) {
  const { host, port } = commonOptions(args);
  const consoleUser = execFileSync("/usr/bin/stat", ["-f", "%Su", "/dev/console"], { encoding: "utf8" }).trim();
  const chromeExists = existsSync(args.chrome || defaults.chrome);
  const portReady = await isPortReady(port, host);
  const version = portReady ? await getVersion(port, host) : null;
  const targets = portReady ? await listTargets(port, host) : [];
  printJson({
    node: process.version,
    webSocket: typeof WebSocket,
    consoleUser,
    chromePath: args.chrome || defaults.chrome,
    chromeExists,
    devtools: {
      host,
      port,
      ready: portReady,
      browser: version?.Browser,
      pages: targets.filter((target) => target.type === "page").length
    }
  });
}

export async function openUrl(args) {
  const { host, port } = commonOptions(args);
  const url = args._[1] || args.url;
  if (!url) throw new CdpError("Usage: glasswing open <url>");
  const target = await createTarget(port, url, host);
  printJson({ status: "opened", id: target.id, url: target.url ?? url });
}

export async function navigate(args) {
  const { host, port, match } = commonOptions(args);
  const url = args._[1] || args.url;
  if (!url) throw new CdpError("Usage: glasswing goto <url>");
  await withPage(port, { host, match }, async (client, target) => {
    await client.send("Page.navigate", { url });
    await waitForLoad(client, Number(args.timeout || 15000));
    const state = await pageState(client);
    printJson({ status: "navigated", target: target.id, ...state });
  });
}

export async function text(args) {
  const { host, port, match } = commonOptions(args);
  await withPage(port, { host, match }, async (client) => {
    const bodyText = await evaluate(client, "document.body ? document.body.innerText : ''");
    process.stdout.write(`${bodyText ?? ""}\n`);
  });
}

export async function state(args) {
  const { host, port, match } = commonOptions(args);
  await withPage(port, { host, match }, async (client, target) => {
    printJson({ target: target.id, ...(await pageState(client)) });
  });
}

export async function waitText(args) {
  const { host, port, match } = commonOptions(args);
  const needle = args._.slice(1).join(" ") || args.text;
  if (!needle) throw new CdpError("Usage: glasswing wait-text <text>");
  const timeoutMs = Number(args.timeout || 15000);
  await withPage(port, { host, match }, async (client) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const bodyText = await evaluate(client, "document.body ? document.body.innerText : ''").catch(() => "");
      if ((bodyText ?? "").toLowerCase().includes(needle.toLowerCase())) {
        printJson({ status: "matched", text: needle });
        return;
      }
      await delay(300);
    }
    throw new CdpError(`Timed out waiting for text: ${needle}`);
  });
}

export async function fill(args) {
  const { host, port, match } = commonOptions(args);
  const identifier = args.selector || args.field || args._[1];
  const value = args.value || args._.slice(2).join(" ");
  if (!identifier || value === undefined) throw new CdpError("Usage: glasswing fill <selector-or-field> <value>");
  await withPage(port, { host, match }, async (client) => {
    const result = await evaluate(client, `(${fillScript})(${JSON.stringify(identifier)}, ${JSON.stringify(value)})`);
    printJson(result);
  });
}

export async function click(args) {
  const { host, port, match } = commonOptions(args);
  const identifier = args.selector || args.text || args._.slice(1).join(" ");
  if (!identifier) throw new CdpError("Usage: glasswing click <selector-or-text>");
  await withPage(port, { host, match }, async (client) => {
    const result = await evaluate(client, `(${clickScript})(${JSON.stringify(identifier)})`);
    printJson(result);
  });
}

export async function evalCommand(args) {
  const { host, port, match } = commonOptions(args);
  const expression = args._.slice(1).join(" ") || args.expression;
  if (!expression) throw new CdpError("Usage: glasswing eval <javascript>");
  await withPage(port, { host, match }, async (client) => {
    printJson(await evaluate(client, expression));
  });
}

export async function screenshot(args) {
  const { host, port, match } = commonOptions(args);
  const output = resolve(args._[1] || args.output || `screenshots/glasswing-${Date.now()}.png`);
  mkdirSync(dirname(output), { recursive: true });
  await withPage(port, { host, match }, async (client) => {
    await client.send("Page.bringToFront").catch(() => undefined);
    const result = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false
    });
    writeFileSync(output, Buffer.from(result.data, "base64"));
    printJson({ status: "saved", output });
  });
}

export async function pages(args) {
  const { host, port } = commonOptions(args);
  const targets = await listTargets(port, host);
  printJson(targets.filter((target) => target.type === "page").map((target) => ({
    id: target.id,
    title: target.title,
    url: target.url
  })));
}

async function pageState(client) {
  return evaluate(client, `(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    text: (document.body?.innerText || '').slice(0, 1000),
    fields: Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]')).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || '',
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      value: el.value || el.textContent || ''
    }))
  }))()`);
}

const fillScript = String.raw`function(identifier, value) {
  function labelFor(el) {
    const labels = [];
    if (el.id) {
      const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (label) labels.push(label.innerText);
    }
    let parent = el.closest('label');
    if (parent) labels.push(parent.innerText);
    labels.push(el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('name'), el.id, el.type);
    return labels.filter(Boolean).join(' ').toLowerCase();
  }
  function find() {
    try {
      const direct = document.querySelector(identifier);
      if (direct) return direct;
    } catch {}
    const wanted = identifier.toLowerCase();
    const fields = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
    return fields.find((el) => labelFor(el).includes(wanted))
      || fields.find((el) => (el.type || '').toLowerCase() === wanted)
      || fields[0];
  }
  const el = find();
  if (!el) return { status: 'missing-field', identifier };
  el.focus();
  if (el.isContentEditable) {
    el.textContent = value;
  } else {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return {
    status: 'filled',
    selector: el.id ? '#' + el.id : el.getAttribute('name') || el.tagName.toLowerCase(),
    value
  };
}`;

const clickScript = String.raw`function(identifier) {
  function visible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }
  function findByText() {
    const wanted = identifier.toLowerCase();
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]'));
    return candidates.find((el) => visible(el) && (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase().includes(wanted));
  }
  let el = null;
  try { el = document.querySelector(identifier); } catch {}
  el = el || findByText();
  if (!el) return { status: 'missing-click-target', identifier };
  el.scrollIntoView({ block: 'center', inline: 'center' });
  el.click();
  return { status: 'clicked', text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim(), tag: el.tagName.toLowerCase() };
}`;

export async function ensureRunning(args) {
  const { host, port } = commonOptions(args);
  if (!(await isPortReady(port, host))) {
    await launch(args);
  }
}

export async function ping(args) {
  const { host, port } = commonOptions(args);
  printJson(await fetchJson(`http://${host}:${port}/json/version`));
}
