import { spawn } from "node:child_process";
import http from "node:http";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (/\r|\n/.test(value)) throw new Error(`${name} must be a single line`);
  return value;
}

const connectionKey = required("CLOVAPI_OFFICIAL_NODE_KEY");
const dailyLimit = Number(process.env.CLOVAPI_OFFICIAL_NODE_DAILY_LIMIT || "100000");
if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100000) {
  throw new Error("CLOVAPI_OFFICIAL_NODE_DAILY_LIMIT must be between 1 and 100000");
}

const adminPort = 27484;
const exposedAdminPort = 28473;
const children = new Set();
let stopping = false;

function start(name, args) {
  const child = spawn("/app/clovapi", args, { stdio: "inherit", env: process.env });
  children.add(child);
  child.once("error", (error) => stop(1, `${name} failed to start: ${error.message}`));
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) stop(code || 1, `${name} stopped${signal ? ` (${signal})` : ""}`);
  });
  return child;
}

const adminProxy = http.createServer((request, response) => {
  const headers = { ...request.headers, host: `127.0.0.1:${adminPort}` };
  if (headers.origin) headers.origin = `http://127.0.0.1:${adminPort}`;
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: adminPort,
    method: request.method,
    path: request.url,
    headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", (error) => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(`clovapi management service unavailable: ${error.message}\n`);
  });
  request.pipe(upstream);
});
adminProxy.on("error", (error) => stop(1, `Management port failed: ${error.message}`));
adminProxy.listen(exposedAdminPort, "0.0.0.0", () => {
  console.log(`Official node management proxy listening on 0.0.0.0:${exposedAdminPort}`);
});

start("management service", ["serve", "--port", String(adminPort), "--no-proxy"]);
start("share worker", ["share", "start", "--key", connectionKey, "--daily-limit", String(dailyLimit)]);

function stop(code, message) {
  if (stopping) return;
  stopping = true;
  if (message) console.error(message);
  adminProxy.close();
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => process.exit(code), 5000);
  timer.unref();
  Promise.allSettled([...children].map((child) => new Promise((resolve) => child.once("exit", resolve))))
    .finally(() => process.exit(code));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(0));
}
