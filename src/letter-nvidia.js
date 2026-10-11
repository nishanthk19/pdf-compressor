import { fail } from "./letter-validation.js";

// Fixed server-side origin: browser input can never redirect credentials.
const ORIGIN = "https://integrate.api.nvidia.com/v1/";
export async function nvidia(path, body, signal) {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) throw fail("NVIDIA AI is not configured on the server.", 503);
  if (process.env.LETTER_NVIDIA_DATA_TRANSFER_ACCEPTED !== "true")
    throw fail(
      "NVIDIA data transfer has not been enabled by the operator.",
      503,
    );
  const timeout = AbortSignal.timeout(120000);
  let response;
  try {
    response = await fetch(new URL(path, ORIGIN), {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw fail("NVIDIA AI connection failed or timed out.", 503);
  }
  if (!response.ok) {
    await response.body?.cancel();
    // Never relay upstream bodies, prompts, or credentials to logs/the browser.
    throw fail(
      response.status === 429
        ? "NVIDIA AI rate limit reached. Please try again later."
        : response.status === 401 || response.status === 403
          ? "NVIDIA AI server credentials need attention."
          : response.status === 410
            ? "The configured NVIDIA model has been retired. Update the server model setting."
            : "NVIDIA AI is temporarily unavailable.",
      503,
    );
  }
  return response;
}

// Parse SSE independently of TCP packet boundaries and CRLF fragmentation.
export async function* nvidiaTokens(response) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    data = [];
  const event = () => {
    const raw = data.join("\n");
    data = [];
    if (raw === "[DONE]") return { done: true };
    if (!raw) return {};
    let part;
    try {
      part = JSON.parse(raw);
    } catch {
      throw fail("Invalid NVIDIA AI stream.", 502);
    }
    if (part.error) throw fail("NVIDIA AI could not complete the draft.", 503);
    const choice = part.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== "stop")
      throw fail(
        "NVIDIA AI returned an incomplete or filtered draft. Please try a shorter request.",
        502,
      );
    return { token: choice?.delta?.content };
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (buffer.length > 200000)
        throw fail("NVIDIA AI stream is too large.", 502);
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
        if (!line) {
          const part = event();
          if (part.done) return;
          if (typeof part.token === "string" && part.token) yield part.token;
        }
      }
      if (done) throw fail("NVIDIA AI stream ended before completion.", 502);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
