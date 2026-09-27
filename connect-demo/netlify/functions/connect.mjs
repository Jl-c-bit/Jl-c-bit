// -----------------------------------------------------------------------------
// Netlify Function that runs the whole Express app, so the demo works on the
// Netlify site without a separate server:  https://<your-site>/connect/
//
// netlify.toml rewrites /connect/* to this function. Settings and secrets come
// from the site's environment variables (Netlify: Site configuration ->
// Environment variables). Data is stored in Netlify Blobs because a function's
// file system is temporary.
// -----------------------------------------------------------------------------
import serverless from "serverless-http";
import { connectLambda, getStore } from "@netlify/blobs";
import { createApp } from "../../server.js";
import { createStripeClient, loadSettings, ConfigError } from "../../lib/stripe.js";
import { createBlobDb } from "../../lib/db.js";
import { messagePage, setBasePath } from "../../lib/views.js";

const BASE_PATH = "/connect";

export const handler = async (event, context) => {
  // Lets Netlify Blobs authenticate inside a Lambda-style function.
  connectLambda(event);

  const env = { ...process.env, BASE_PATH };
  const settings = loadSettings(env);

  let stripeClient;
  try {
    stripeClient = createStripeClient(env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    // Explain exactly what to set instead of failing with a blank error.
    setBasePath(BASE_PATH);
    return {
      statusCode: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: messagePage({
        title: "Setup needed",
        heading: "Almost there: add your Stripe key",
        message: `${err.message} On Netlify, add it under Site configuration > Environment variables, then redeploy the site.`,
      }),
    };
  }

  const db = createBlobDb(getStore({ name: "connect-demo", consistency: "strong" }));
  const app = createApp({ stripeClient, db, settings, env });
  return serverless(app)(event, context);
};
