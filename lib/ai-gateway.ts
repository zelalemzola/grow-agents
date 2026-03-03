import { createGateway } from "ai";

export function getGateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing AI_GATEWAY_API_KEY.");
  }
  return createGateway({ apiKey });
}
