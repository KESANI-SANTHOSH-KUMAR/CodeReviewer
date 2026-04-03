import axios from "axios";

type ChunkHandler = (chunk: string) => void;

export async function streamReview(
  code: string,
  language: string,
  onChunk: ChunkHandler
): Promise<void> {
  const aiServiceUrl = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";

  const response = await axios.post(
    `${aiServiceUrl}/review`,
    { code, language },
    {
      responseType: "stream",
      headers: {
        Accept: "text/event-stream",
      },
      timeout: 0,
    }
  );

  await new Promise<void>((resolve, reject) => {
    let buffer = "";
    let finished = false;

    const finish = () => {
      if (!finished) {
        finished = true;
        resolve();
      }
    };

    const handleBlock = (block: string): boolean => {
      const lines = block.split("\n");

      for (const line of lines) {
        const trimmed = line.trimStart();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).replace(/^ /, "");

        if (payload === "[DONE]") {
          finish();
          return true;
        }

        if (payload) {
          onChunk(payload);
        }
      }

      return false;
    };

    const drainBuffer = (): void => {
      buffer = buffer.replace(/\r\n/g, "\n");

      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const eventBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const shouldStop = handleBlock(eventBlock);
        if (shouldStop) return;

        separatorIndex = buffer.indexOf("\n\n");
      }
    };

    response.data.on("data", (data: Buffer) => {
      if (finished) return;
      buffer += data.toString("utf8");
      drainBuffer();
    });

    response.data.on("end", () => {
      if (!finished) {
        if (buffer.trim()) {
          handleBlock(buffer);
        }
        finish();
      }
    });

    response.data.on("error", (err: Error) => {
      if (!finished) reject(err);
    });
  });
}