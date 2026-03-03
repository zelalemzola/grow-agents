export interface UiStreamChunk {
  type: string;
  data?: unknown;
  transient?: boolean;
  [key: string]: unknown;
}

export async function readUiMessageSseStream(
  response: Response,
  onChunk: (chunk: UiStreamChunk) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("Streaming response body is missing.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let delimiterIndex = buffer.indexOf("\n\n");
    while (delimiterIndex !== -1) {
      const rawEvent = buffer.slice(0, delimiterIndex).trim();
      buffer = buffer.slice(delimiterIndex + 2);
      delimiterIndex = buffer.indexOf("\n\n");

      if (!rawEvent) {
        continue;
      }

      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (dataLines.length === 0) {
        continue;
      }

      const dataText = dataLines.join("\n");
      if (dataText === "[DONE]") {
        continue;
      }

      onChunk(JSON.parse(dataText) as UiStreamChunk);
    }
  }
}
