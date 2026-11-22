import {requestSchema, variantSchema} from "./property_service.ts";
const request = requestSchema.parse({propertyId: "building-7", issue: "leaking tap", filename: "sink.jpg", tenantDocument: "lease-22", inspectionDue: "2026-10-01"});
if (request.propertyId !== "building-7") throw new Error("property id decision failed");
const variant = variantSchema.parse({width: 800, height: 600});
if (variant.format !== "webp") throw new Error("default image format failed");
console.log("domain validation passed");
