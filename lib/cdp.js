import { setTimeout as delay } from "node:timers/promises";

export class CdpError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = "CdpError";
    this.details = details;
  }
}

export async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new CdpError(`Fetch failed for ${url}: ${error.message}`, {
      cause: error.cause?.message ?? error.cause ?? error.message,
      url
    });
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new CdpError(`HTTP ${response.status} for ${url}`, body);
  }
  return response.json();
}

export async function isPortReady(port, host = "127.0.0.1") {
  try {
    await fetchJson(`http://${host}:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
}

export async function waitForPort(port, { host = "127.0.0.1", timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortReady(port, host)) return;
    await delay(200);
  }
  throw new CdpError(`Chrome DevTools did not become ready on ${host}:${port}`);
}

export async function getVersion(port, host = "127.0.0.1") {
  return fetchJson(`http://${host}:${port}/json/version`);
}

export async function listTargets(port, host = "127.0.0.1") {
  try {
    return await fetchJson(`http://${host}:${port}/json/list`);
  } catch (error) {
    return listTargetsViaBrowser(port, host, error);
  }
}

export async function createTarget(port, url = "about:blank", host = "127.0.0.1") {
  const encoded = encodeURIComponent(url);
  try {
    return await fetchJson(`http://${host}:${port}/json/new?${encoded}`, { method: "PUT" });
  } catch (error) {
    return createTargetViaBrowser(port, url, host, error);
  }
}

export async function activateTarget(port, id, host = "127.0.0.1") {
  await fetch(`http://${host}:${port}/json/activate/${id}`).catch(() => undefined);
}

export async function pickPageTarget(port, { host = "127.0.0.1", match } = {}) {
  const targets = await listTargets(port, host);
  const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (match) {
    const matched = pages.find((target) => {
      const haystack = `${target.title ?? ""}\n${target.url ?? ""}\n${target.id ?? ""}`;
      return haystack.toLowerCase().includes(match.toLowerCase());
    });
    if (!matched) throw new CdpError(`No Chrome page target matched "${match}"`);
    return matched;
  }
  if (!pages.length) return createTarget(port, "about:blank", host);
  return pages[0];
}

export class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.opened = false;
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
    this.socket.addEventListener("close", () => this.rejectAll(new CdpError("CDP socket closed")));
    this.socket.addEventListener("error", () => this.rejectAll(new CdpError("CDP socket error")));
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new CdpError("Timed out opening CDP socket")), 10000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        this.opened = true;
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new CdpError("Could not open CDP socket"));
      }, { once: true });
    });
  }

  handleMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new CdpError(message.error.message ?? "CDP command failed", message.error));
      } else {
        resolve(message.result ?? {});
      }
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      for (const listener of this.listeners.get(message.method)) listener(message.params ?? {});
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  send(method, params = {}) {
    if (!this.opened || this.socket.readyState !== WebSocket.OPEN) {
      throw new CdpError("CDP socket is not open");
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(payload);
    return promise;
  }

  async close() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const closed = new Promise((resolve) => {
        this.socket.addEventListener("close", resolve, { once: true });
      });
      this.socket.close();
      await Promise.race([closed, delay(500)]);
    }
    this.listeners.clear();
  }

  rejectAll(error) {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }
}

async function withBrowser(port, host, callback) {
  const version = await getVersion(port, host);
  if (!version.webSocketDebuggerUrl) {
    throw new CdpError(`Chrome DevTools browser WebSocket is unavailable on ${host}:${port}`);
  }
  const client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

async function listTargetsViaBrowser(port, host, originalError) {
  try {
    return await withBrowser(port, host, async (client) => {
      const result = await client.send("Target.getTargets");
      return (result.targetInfos ?? []).map((target) => ({
        id: target.targetId,
        title: target.title,
        type: target.type,
        url: target.url,
        attached: target.attached
      }));
    });
  } catch (fallbackError) {
    throw new CdpError(`Could not list Chrome targets on ${host}:${port}`, {
      httpError: originalError.message,
      fallbackError: fallbackError.message
    });
  }
}

async function createTargetViaBrowser(port, url, host, originalError) {
  try {
    return await withBrowser(port, host, async (client) => {
      const result = await client.send("Target.createTarget", { url });
      const targets = await listTargets(port, host).catch(() => []);
      return targets.find((target) => target.id === result.targetId) ?? {
        id: result.targetId,
        targetId: result.targetId,
        type: "page",
        title: "",
        url
      };
    });
  } catch (fallbackError) {
    throw new CdpError(`Could not create Chrome target on ${host}:${port}`, {
      httpError: originalError.message,
      fallbackError: fallbackError.message,
      url
    });
  }
}

export async function withPage(port, options, callback) {
  const target = await pickPageTarget(port, options);
  if (target.id) await activateTarget(port, target.id, options.host);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    return await callback(client, target);
  } finally {
    await client.close();
  }
}

export async function waitForLoad(client, timeoutMs = 15000) {
  let done = false;
  const loaded = new Promise((resolve) => {
    const off = client.on("Page.loadEventFired", () => {
      done = true;
      off();
      resolve();
    });
  });
  const readyState = async () => {
    while (!done) {
      const result = await client.send("Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true
      }).catch(() => undefined);
      if (result?.result?.value === "complete") return;
      await delay(250);
    }
  };
  await Promise.race([
    loaded,
    readyState(),
    delay(timeoutMs).then(() => undefined)
  ]);
}

export async function evaluate(client, expression, { awaitPromise = true } = {}) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new CdpError("Evaluation failed", result.exceptionDetails);
  }
  return result.result?.value;
}
