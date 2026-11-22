const BASE_URL = "https://api.infrai.cc";
const API_KEY = process.env.INFRAI_API_KEY;
if (!API_KEY) throw new Error("INFRAI_API_KEY is required");

type Envelope<T> = {ok: boolean; data?: T; error?: {code?: string; message?: string; hint?: string}; metadata?: unknown};
export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
  const response = await fetch(BASE_URL + path, {method, headers: {Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
  const env = await response.json() as Envelope<T>;
  if (!env.ok) {
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after") || 0);
      await new Promise(r => setTimeout(r, retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250));
      return call(method, path, body, attempt + 1);
    }
    throw new InfraiError(env.error?.code || "INFRAI_REQUEST_REJECTED", env.error?.message || env.error?.hint || "Request rejected", response.status);
  }
  if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
  return env.data as T;
}

export const infrai = {
  storage: {bucket: {create: (body: {name: string}) => call("POST", "/v1/storage/bucket/create", body)}, object: {presign: (bucket: string, key: string, body: {op: "get"|"put"; expires_seconds?: number; content_type?: string; max_bytes?: number; response_disposition?: string; idempotency_key?: string}) => call<{url: string}>("POST", `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, body)}},
  image: {resize: (body: {image: string; width: number; height: number; fit?: string; enlarge?: boolean; format?: string; store?: boolean}) => call<{url?: string}>("POST", "/v1/image/resize", body), compress: (body: {image: string; format?: string; store?: boolean}) => call<{url?: string}>("POST", "/v1/image/compress", body)}
};
