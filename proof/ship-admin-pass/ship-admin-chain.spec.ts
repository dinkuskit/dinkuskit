import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import worker from "../src/worker";
import minted from "./chain-passes.json";

// DinkusKit.com's real issuer (synthetic fixture, ephemeral key) to Ship's real admin
// routes. Copied into dinkuskit/ship service/spec/ for the run; chain-passes.json is
// written by dinkuskit proof/ship-admin-pass/mint-ship-passes.mjs and deleted after.
// Pitney Bowes's sandbox is stood in for, as in admin.spec.ts.
const ORIGIN = "https://ship.example.invalid";
const ISSUER = "https://dinkuskit.com/account";
const PB = "https://shipping-api-sandbox.pitneybowes.com";
const LABEL_URL = "https://stg-labels-cls.gcs.pitneybowes.com/usps/sample/outbound/label/sample.pdf";
const PB_PRICES: Record<string, number> = { UGA: 5.1, PM: 9.35, EM: 31.2 };
const SESSION = `${crypto.randomUUID()}${crypto.randomUUID()}`;
let pbCalls: { method: string; path: string }[];
const configured = () => ({
  ...env, ACCOUNT_ISSUER: ISSUER, ACCOUNT_AUDIENCE: "dinkus-ship", ACCOUNT_JWKS_URL: `${ISSUER}/jwks`,
  ACCOUNT_SIGNIN_URL: `${ISSUER}/ship-sign-in`, ACCOUNT_TOKEN_URL: `${ISSUER}/token`, SHIP_SESSION_SECRET: SESSION,
}) as unknown as Env;

beforeEach(() => {
  pbCalls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new Request(input, init).url;
    if (url === `${ISSUER}/jwks`) return Response.json({ keys: [minted.publicJwk] });
    if (url === LABEL_URL) return new Response("%PDF-1.4 sandbox label", { headers: { "content-type": "application/pdf" } });
    if (!url.startsWith(`${PB}/`)) throw new Error(`unexpected fetch ${url}`);
    const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : undefined;
    const path = new URL(url).pathname, method = init?.method ?? "GET";
    pbCalls.push({ method, path });
    if (path === "/oauth/token") return Response.json({ access_token: "synthetic-pb-pass", tokenType: "BearerToken", expiresIn: 36000 });
    if (path === "/shippingservices/v1/rates") return Response.json({ rates: [{ ...body.rates[0], totalCarrierCharge: PB_PRICES[body.rates[0].serviceId], currencyCode: "USD" }] });
    if (path === "/shippingservices/v1/shipments" && method === "POST") return Response.json({
      shipmentId: "SANDBOX-SHIPMENT-A", parcelTrackingNumber: "SANDBOX-TRACKING-A",
      rates: [{ carrier: "USPS", serviceId: body.rates[0].serviceId, parcelType: "PKG", totalCarrierCharge: PB_PRICES[body.rates[0].serviceId], currencyCode: "USD" }],
      documents: [{ type: "SHIPPING_LABEL", contentType: "URL", fileFormat: "PDF", size: "DOC_8X11", contents: LABEL_URL }],
    });
    throw new Error(`unexpected Pitney Bowes call ${method} ${path}`);
  });
});
afterEach(() => vi.restoreAllMocks());

async function call(token: string, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), configured());
  const text = await response.text();
  return { status: response.status, json: JSON.parse(text) as any };
}
const shipments = () => pbCalls.filter(c => c.method === "POST" && c.path === "/shippingservices/v1/shipments").length;

test("a DinkusKit.com ship:admin pass reaches Ship's admin routes for its own store only; order-only, other-store and expired passes are refused before any label is bought", async () => {
  // Commerce's ship:orders pass from the same issuer sends a TEST order.
  expect((await call(minted.orders, "POST", "/v1/orders", {
    schema: "dinkuskit.commerce.ship-order/v1", orderId: "order:chain", number: 1001, version: 1, status: "processing", test: true,
    shipTo: { name: "Demo Shopper", line1: "1 Example Way", city: "Testville", region: "California", postalCode: "90000", country: "US" },
    email: "shopper@example.test", completed: null,
    lines: [{ catalogItemId: "item_demo", name: "Demo Mug", quantity: 2, weightOz: 12.5, unitPrice: { currency: "USD", minor: "1250" } }],
  })).status).toBe(200);
  const store = env.SHIP_STORES.get(env.SHIP_STORES.idFromName(minted.siteId));
  await store.saveShipFrom({ name: "Demo Store", line1: "2 Warehouse Rd", city: "Shiptown", region: "ny", postalCode: "10001" });
  await store.addBox({ name: "Small", lengthIn: "8", widthIn: "6", heightIn: "4", weightOz: "3" });
  const boxId = (await store.getSettings()).boxes[0]!.boxId;
  const label = { version: 1, boxId, weightOz: 28, service: "PM", by: "staff@example.test" };

  // Refused before any Pitney Bowes shipment: an order-only pass, another store's admin pass, an expired admin pass.
  expect((await call(minted.orders, "GET", "/v1/admin/orders")).status).toBe(403);
  expect((await call(minted.orders, "POST", "/v1/admin/orders/order%3Achain/labels", label)).status).toBe(403);
  expect((await call(minted.otherAdmin, "GET", "/v1/admin/orders")).json.orders).toEqual([]);
  expect((await call(minted.otherAdmin, "GET", "/v1/admin/orders/order%3Achain")).status).toBe(404);
  expect((await call(minted.otherAdmin, "POST", "/v1/admin/orders/order%3Achain/labels", label)).status).toBe(404);
  expect((await call(minted.expiredAdmin, "GET", "/v1/admin/orders")).status).toBe(401);
  expect((await call(minted.expiredAdmin, "POST", "/v1/admin/orders/order%3Achain/labels", label)).status).toBe(401);
  expect(shipments()).toBe(0);
  // The admin pass is refused on Commerce's routes.
  expect((await call(minted.admin, "GET", "/v1/labels")).status).toBe(403);

  // Allowed: the store's own ship:admin pass lists, prices and buys a sandbox label.
  expect((await call(minted.admin, "GET", "/v1/admin/orders")).json.orders).toMatchObject([{ orderId: "order:chain", status: "processing", test: true }]);
  expect((await call(minted.admin, "POST", "/v1/admin/orders/order%3Achain/prices", { version: 1, boxId, weightOz: 28 })).json).toEqual({ prices: { GA: 510, PM: 935, EM: 3120 } });
  const bought = await call(minted.admin, "POST", "/v1/admin/orders/order%3Achain/labels", label);
  expect(bought.status).toBe(201);
  expect(bought.json.label).toMatchObject({ orderId: "order:chain", test: true, status: "bought", createdBy: "admin:staff@example.test" });
  expect(shipments()).toBe(1);
});
