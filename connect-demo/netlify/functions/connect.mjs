// -----------------------------------------------------------------------------
// Netlify Function that runs the whole Express app, so the demo works on the
// Netlify site without a separate server:  https://<your-site>/connect/
//
// This is a modern (v2) Netlify Function: `config.path` routes /connect and
// /connect/* here, and Netlify Blobs is configured automatically (including the
// strong-consistency reads the demo relies on right after sign-up).
//
// How it runs Express: on the first request the app starts listening on a
// private local port inside the function, and each incoming Request is
// forwarded to it unchanged (same method, headers and raw body, so Stripe
// webhook signatures still verify). Warm invocations reuse the running app.
//
// Settings and secrets come from the site's environment variables (Netlify:
// Project configuration -> Environment variables).
// -----------------------------------------------------------------------------
import http from "node:http";
import { getStore } from "@netlify/blobs";
import { createApp } from "../../server.js";
import { createStripeClient, loadSettings, ConfigError } from "../../lib/stripe.js";
import { createBlobDb } from "../../lib/db.js";
import { messagePage, setBasePath } from "../../lib/views.js";

const BASE_PATH = "/connect";

// Headers that describe one hop of the connection, not the request itself.
const HOP_HEADERS = ["host", "connection", "content-length", "transfer-encoding", "keep-alive", "content-encoding"];

/**
 * Build a request handler. The default export below uses the real Stripe key
 * and Netlify Blobs; tests pass their own `makeApp`.
 */
export function createHandler(makeApp) {
  let serverPromise = null;

  const startServer = () =>
    new Promise((resolve, reject) => {
      let app;
      try {
        app = makeApp();
      } catch (err) {
        reject(err);
        return;
      }
      const server = http.createServer(app);
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.unref(); // never keep the process alive just for this local server
        resolve(server);
      });
    });

  return async function handler(request) {
    try {
      serverPromise ??= startServer();
      const server = await serverPromise;
      const { port } = server.address();

      // Forward the request to the local Express app.
      const url = new URL(request.url);
      const headers = new Headers(request.headers);
      HOP_HEADERS.forEach((h) => headers.delete(h));
      const hasBody = !["GET", "HEAD"].includes(request.method);
      const upstream = await fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined,
        redirect: "manual", // pass redirects (303s to Stripe, etc.) straight to the browser
      });

      // Copy the response back, keeping every Set-Cookie header.
      const out = new Headers();
      upstream.headers.forEach((value, key) => {
        if (key !== "set-cookie" && !HOP_HEADERS.includes(key)) out.set(key, value);
      });
      for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
      const body = request.method === "HEAD" ? null : await upstream.arrayBuffer();
      return new Response(body, { status: upstream.status, headers: out });
    } catch (err) {
      serverPromise = null; // try again on the next request
      if (err instanceof ConfigError) {
        // Explain exactly what to set instead of failing with a blank error.
        setBasePath(BASE_PATH);
        return new Response(
          messagePage({
            title: "Setup needed",
            heading: "Almost there: add your Stripe key",
            message: `${err.message} On Netlify, add it under Project configuration > Environment variables, then redeploy the site.`,
          }),
          { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }
        );
      }
      throw err;
    }
  };
}

export default createHandler(() => {
  const env = { ...process.env, BASE_PATH };
  const stripeClient = createStripeClient(env); // throws ConfigError when the key is missing
  const db = createBlobDb(getStore({ name: "connect-demo", consistency: "strong" }));
  return createApp({ stripeClient, db, settings: loadSettings(env), env });
});

// Route /connect and everything under it to this function.
export const config = {
  path: ["/connect", "/connect/*"],
};
