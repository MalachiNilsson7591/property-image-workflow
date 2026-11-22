import {createServer} from "node:http";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {infrai, InfraiError} from "./infrai_client.ts";

const BUCKET = "property-images";
const requests = new Map<string, {id: string; propertyId: string; issue: string; imageKey: string; tenantDocument?: string; inspectionDue?: string}>();
const requestSchema = z.object({propertyId: z.string().min(1), issue: z.string().min(1), filename: z.string().min(1), tenantDocument: z.string().optional(), inspectionDue: z.string().optional()});
const variantSchema = z.object({width: z.number().int().positive().max(4000), height: z.number().int().positive().max(4000), format: z.enum(["auto", "webp", "avif", "jpeg", "png", "heic"]).default("webp")});

async function ensureBucket() { await infrai.storage.bucket.create({name: BUCKET}).catch(() => undefined); }
const ready = ensureBucket();
function send(res: any, status: number, value: unknown) { res.writeHead(status, {"content-type": "application/json"}); res.end(JSON.stringify(value)); }
async function body(req: any) { let raw = ""; for await (const chunk of req) raw += chunk; return JSON.parse(raw || "{}"); }

const server = createServer(async (req, res) => {
  try {
    await ready;
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "POST" && url.pathname === "/requests") {
      const input = requestSchema.parse(await body(req));
      const id = randomUUID(); const imageKey = `${input.propertyId}/${id}-${input.filename}`;
      requests.set(id, {id, propertyId: input.propertyId, issue: input.issue, imageKey, tenantDocument: input.tenantDocument, inspectionDue: input.inspectionDue});
      const upload = await infrai.storage.object.presign(BUCKET, imageKey, {op: "put", expires_seconds: 900, content_type: "image/jpeg", idempotency_key: id});
      return send(res, 201, {requestId: id, uploadUrl: upload.url, imageKey});
    }
    const match = url.pathname.match(/^\/requests\/([^/]+)\/variants$/);
    if (req.method === "POST" && match) {
      const item = requests.get(match[1]); if (!item) return send(res, 404, {error: "request not found"});
      const input = variantSchema.parse(await body(req));
      const resized = await infrai.image.resize({image: item.imageKey, width: input.width, height: input.height, fit: "cover", enlarge: false, format: input.format, store: true});
      const compressed = await infrai.image.compress({image: resized.url || item.imageKey, format: input.format, store: true});
      return send(res, 200, {requestId: item.id, variant: compressed.url || resized.url});
    }
    send(res, 404, {error: "route not found"});
  } catch (error) { const status = error instanceof z.ZodError ? 400 : error instanceof InfraiError && error.status < 500 ? error.status : 500; send(res, status, {error: error instanceof Error ? error.message : "request failed"}); }
});
if (process.argv[1]?.endsWith("property_service.ts")) server.listen(Number(process.env.PORT || 3000));
export {requestSchema, variantSchema, requests};
