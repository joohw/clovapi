function encodeRequest(ir) {
  const input = ir.messages.map((m) => ({
    type: "message",
    role: m.role,
    content: [{ type: "input_text", text: m.content }],
  }));
  const body = {
    model: ir.model,
    input,
    stream: ir.stream !== false,
    store: false,
    instructions: ir.metadata?.instructions ?? "",
  };
  if (ir.max_tokens != null && !ir.metadata?.codexSubscription) {
    body.max_output_tokens = ir.max_tokens;
  }
  if (ir.temperature != null) body.temperature = ir.temperature;
  return Buffer.from(JSON.stringify(body));
}

function encodeResponseJson(events) {
  const err = events.find((e) => e.type === "error");
  if (err) {
    return Buffer.from(
      JSON.stringify({ error: { message: err.message, type: err.code || "api_error" } }),
    );
  }
  let text = "";
  for (const e of events) {
    if (e.type === "text_delta") text += e.text || "";
  }
  return Buffer.from(
    JSON.stringify({
      id: "resp_proxy",
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        },
      ],
    }),
  );
}

async function* encodeSseStream(eventSource) {
  for await (const event of eventSource) {
    if (event.type === "error") {
      yield Buffer.from(
        `event: error\ndata: ${JSON.stringify({ error: { message: event.message, type: event.code } })}\n\n`,
      );
      return;
    }
    if (event.type === "text_delta" && event.text) {
      yield Buffer.from(
        `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: event.text })}\n\n`,
      );
    }
    if (event.type === "finish") {
      yield Buffer.from(
        `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", status: "completed" })}\n\n`,
      );
    }
  }
  yield Buffer.from("data: [DONE]\n\n");
}

module.exports = {
  encodeRequest,
  encodeResponseJson,
  encodeSseStream,
};
