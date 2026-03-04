import { createGateway } from "ai";
import { Agent } from "undici";

export function getGateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing AI_GATEWAY_API_KEY.");
  }
  // Video generation can take several minutes; extend timeouts beyond default 5 min.
  const longTimeoutAgent = new Agent({
    headersTimeout: 15 * 60 * 1000,
    bodyTimeout: 15 * 60 * 1000,
  });
  return createGateway({
    apiKey,
    fetch: (url, init) =>
      fetch(url, {
        ...init,
        dispatcher: longTimeoutAgent,
      } as RequestInit),
  });
}
