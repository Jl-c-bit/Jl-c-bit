// -----------------------------------------------------------------------------
// Tiny "database" for the demo, with two storage backends:
//
//   - createDb(file)        a JSON file (local development)
//   - createBlobDb(store)   Netlify Blobs (when deployed as a Netlify Function,
//                           where the file system is read-only and temporary)
//
// It stores:
//   - users of YOUR app (name, email)
//   - the mapping user -> Stripe connected account ID (acct_...)
//   - each user's platform subscription status, written by the billing webhook
//
// It deliberately does NOT store onboarding status: the dashboard always asks
// the Stripe API for it, so it can never go stale.
//
// Every method is async so both backends share one interface.
// TODO: replace this with your real database (Postgres, etc.), keeping the same
// methods so the rest of the app doesn't change. This demo stores everything in
// one JSON document, which is fine for a demo but not for concurrent traffic.
// -----------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const EMPTY = () => ({ users: [] });

// Shared logic on top of a load/save pair.
function makeDb(load, save) {
  const read = async () => (await load()) ?? EMPTY();
  const write = async (fn) => {
    const data = await read();
    const result = fn(data);
    await save(data);
    return result;
  };

  return {
    listUsers: async () => (await read()).users,
    getUser: async (id) => (await read()).users.find((u) => u.id === id) ?? null,
    findUserByAccountId: async (accountId) => (await read()).users.find((u) => u.stripeAccountId === accountId) ?? null,

    // Create a user together with their connected account ID (the mapping).
    createUser: ({ name, email, stripeAccountId }) =>
      write((data) => {
        const user = { id: randomUUID(), name, email, stripeAccountId, subscription: null, createdAt: new Date().toISOString() };
        data.users.push(user);
        return user;
      }),

    // Store the latest subscription state for the user who owns `accountId`.
    // Returns the updated user, or null if no user owns that account.
    setSubscription: (accountId, subscription) =>
      write((data) => {
        const user = data.users.find((u) => u.stripeAccountId === accountId);
        if (user) user.subscription = subscription;
        return user ?? null;
      }),
  };
}

/** JSON file backend. Pass `null` for an in-memory database (tests). */
export function createDb(file) {
  let memory = null;
  return makeDb(
    async () => {
      if (!file) return memory;
      if (!existsSync(file)) return null;
      try {
        return JSON.parse(readFileSync(file, "utf8"));
      } catch {
        console.warn(`Could not read ${file}; starting with an empty database.`);
        return null;
      }
    },
    async (data) => {
      if (!file) {
        memory = data;
        return;
      }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(data, null, 2));
    }
  );
}

/** Netlify Blobs backend: `store` comes from getStore() in @netlify/blobs. */
export function createBlobDb(store, key = "db") {
  return makeDb(
    () => store.get(key, { type: "json" }),
    (data) => store.setJSON(key, data)
  );
}
