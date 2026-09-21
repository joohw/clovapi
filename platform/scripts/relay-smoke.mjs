import process from "node:process";
import WebSocket from "ws";

const baseURL = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/u, "");
const connectionKey = process.env.CLOVAPI_SMOKE_CONNECTION_KEY;
const consumerKey = process.env.CLOVAPI_SMOKE_CONSUMER_KEY;
const model = process.env.CLOVAPI_SMOKE_MODEL || "clovapi-smoke-model";
const deviceId = process.env.CLOVAPI_SMOKE_DEVICE_ID || "00000000-0000-4000-8000-000000000001";

if (!connectionKey || !consumerKey) {
  throw new Error("Set CLOVAPI_SMOKE_CONNECTION_KEY and CLOVAPI_SMOKE_CONSUMER_KEY.");
}

function deadline(promise, milliseconds, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const registration = await fetch(`${baseURL}/api/node/register`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${connectionKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ deviceId, name: "clovapi relay smoke", dailyLimit: 100 }),
});
const registrationBody = await registration.json();
if (!registration.ok || registrationBody?.ok !== true || typeof registrationBody.key !== "string") {
  throw new Error(`Node registration failed with ${registration.status}.`);
}

const websocketURL = `${baseURL.replace(/^http/u, "ws")}/api/node/connect`;
const socket = new WebSocket(websocketURL, {
  headers: { Authorization: `Bearer ${registrationBody.key}` },
  handshakeTimeout: 10_000,
});

let welcomeResolve;
let welcomeReject;
const welcome = new Promise((resolve, reject) => {
  welcomeResolve = resolve;
  welcomeReject = reject;
});

socket.on("open", () => {
  socket.send(JSON.stringify({
    type: "hello",
    protocol: 1,
    models: [model],
    paused: false,
    remaining: 100,
    concurrency: 5,
  }));
});
socket.on("error", welcomeReject);
socket.on("message", (raw) => {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    welcomeReject(new Error("Node socket received invalid JSON."));
    return;
  }
  if (message.type === "welcome") {
    welcomeResolve(message);
    return;
  }
  if (message.type !== "request" || typeof message.id !== "string") return;
  const responseBody = Buffer.from(JSON.stringify({
    id: "clovapi-smoke-response",
    object: "chat.completion",
    model,
    choices: [],
  }));
  socket.send(JSON.stringify({
    type: "headers",
    id: message.id,
    seq: 0,
    status: 200,
    contentType: "application/json",
  }));
  socket.send(JSON.stringify({ type: "data", id: message.id, seq: 1, data: responseBody.toString("base64") }));
  socket.send(JSON.stringify({ type: "end", id: message.id, seq: 2 }));
});

const welcomeFrame = await deadline(welcome, 10_000, "WebSocket welcome");
if (welcomeFrame.protocol !== 1 || welcomeFrame.nodeId !== registrationBody.nodeId) {
  socket.close();
  throw new Error("WebSocket welcome did not match the registered node.");
}

let relayResponse;
for (let attempt = 0; attempt < 30; attempt++) {
  relayResponse = await fetch(`${baseURL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${consumerKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "smoke" }] }),
  });
  if (relayResponse.ok) break;
  const error = await relayResponse.clone().json().catch(() => null);
  if (error?.error?.code !== "no_node_capacity") break;
  await delay(100);
}

if (!relayResponse?.ok) {
  const status = relayResponse?.status ?? 0;
  socket.close();
  throw new Error(`Relay request failed with ${status}.`);
}
const relayed = await relayResponse.json();
if (relayed?.id !== "clovapi-smoke-response" || relayed?.model !== model) {
  socket.close();
  throw new Error("Relay response payload did not round-trip through the node.");
}

socket.close(1000, "smoke_complete");
console.log(`Relay smoke passed for ${model} through node ${registrationBody.nodeId}.`);
