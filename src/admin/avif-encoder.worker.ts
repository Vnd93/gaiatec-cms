import encodeAvif from "@jsquash/avif/encode";

type EncodeRequest = {
  type: "encode";
  requestId: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
};

type WorkerScope = {
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

const workerScope = self as unknown as WorkerScope;

function isEncodeRequest(value: unknown): value is EncodeRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<EncodeRequest>;
  return (
    request.type === "encode" &&
    typeof request.requestId === "string" &&
    request.requestId.length >= 1 &&
    request.requestId.length <= 80 &&
    Number.isInteger(request.width) &&
    Number.isInteger(request.height) &&
    Number(request.width) >= 1 &&
    Number(request.height) >= 1 &&
    Number(request.width) <= 1_600 &&
    Number(request.height) <= 1_600 &&
    Number(request.width) * Number(request.height) <= 2_560_000 &&
    request.pixels instanceof ArrayBuffer &&
    request.pixels.byteLength === Number(request.width) * Number(request.height) * 4
  );
}

workerScope.addEventListener("message", async (event) => {
  const request = event.data;
  if (!isEncodeRequest(request)) return;
  try {
    const pixels = new Uint8ClampedArray(request.pixels);
    const encoded = await encodeAvif(new ImageData(pixels, request.width, request.height), {
      quality: 60,
      speed: 8,
    });
    const result = encoded.slice(0);
    workerScope.postMessage({ type: "result", requestId: request.requestId, result }, [result]);
  } catch {
    workerScope.postMessage({ type: "error", requestId: request.requestId }, []);
  }
});
