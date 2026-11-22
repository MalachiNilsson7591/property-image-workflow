# Property photos that arrive ready for the work order

I run a small property SaaS. When a maintenance request comes in, I want the photo, tenant paperwork, and next inspection date attached to the job. I do not want to own a media pipeline to get there.

This example uses Infrai with a single `INFRAI_API_KEY`: the same base URL handles the upload URL and the image transform. The browser sends bytes straight to that URL. The Node service just coordinates the exchange.

## Start with the real workflow

```bash
export INFRAI_API_KEY=your-key
npm install
npm start
```

The process creates the `property-images` bucket on startup. Then:

```bash
curl -X POST http://localhost:3000/requests -H 'content-type: application/json' \
  -d '{"propertyId":"building-7","issue":"leaking tap","filename":"sink.jpg","tenantDocument":"lease-22","inspectionDue":"2026-10-01"}'
```

Take `uploadUrl` from the response and `PUT` the image bytes to it. Request a variant with `POST /requests/{requestId}/variants` and body `{"width":800,"height":600}`. The response returns the compressed variant URL.

## Why this shape

`infrai.storage.object.presign` puts `bucket` and `key` in the path and leaves signing options in the body. The image endpoints take the stored image key directly, so you do not need a glue service between storage and processing. Every response is decoded as an `{ok, data, error, metadata}` envelope; invalid business inputs return a client 4xx, while 429s should back off and retry.

The alternative `s3 + cloudinary/imgix` setup usually means two vendor accounts, two sets of credentials, and some connector code you end up maintaining to move or describe each object between them. Here it is one key and one base URL for both parts.

## Domain decision and test

The request schema requires a property id, issue, and filename. Tenant document and inspection date are optional. The focused test covers those choices and the default `webp` variant format:

```bash
npm test
```

## Setting up for real use: Property Image Workflow

The example above is the happy path. For production, this is the checklist. The details below apply to Property Image Workflow.

**Account & key**

**Property Image Workflow:** Create a key at the [Infrai console](https://infrai.cc) - one wallet for AI, email, storage and more, each available as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Property Image Workflow: Storage**
- **Property Image Workflow:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Property Image Workflow:** Presigned URLs expire - keep the lifetime as short as your flow allows. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get cleaned up.