// -----------------------------------------------------------------------------
// Tiny JSON-file "database" for the demo.
//
// It stores:
//   - users of YOUR app (name, email)
//   - the mapping user -> Stripe connected account ID (acct_...)
//   - each user's platform subscription status, written by the billing webhook
//
// It deliberately does NOT store onboarding status: the dashboard always asks
// the Stripe API for it, so it can never go stale.
//
// TODO: replace this file with your real database (Postgres, etc.). Keep the
// same functions so the rest of the app doesn't change.
// -----------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export function createDb(file) {
  let data = { users: [] };
  if (file && existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      console.warn(`Could not read ${file}; starting with an empty database.`);
    }
  }

  const save = () => {
    if (!file) return; // in-memory mode (used by tests)
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2));
  };

  return {
    listUsers: () => data.users.slice(),
    getUser: (id) => data.users.find((u) => u.id === id) ?? null,
    findUserByAccountId: (accountId) => data.users.find((u) => u.stripeAccountId === accountId) ?? null,

    createUser({ name, email }) {
      const user = { id: randomUUID(), name, email, stripeAccountId: null, subscription: null, createdAt: new Date().toISOString() };
      data.users.push(user);
      save();
      return user;
    },

    // Store the user -> connected account mapping.
    linkStripeAccount(userId, stripeAccountId) {
      const user = data.users.find((u) => u.id === userId);
      if (!user) throw new Error(`No user ${userId}`);
      user.stripeAccountId = stripeAccountId;
      save();
      return user;
    },

    // Store the latest subscription state for the user who owns `accountId`.
    // Returns the updated user, or null if no user owns that account.
    setSubscription(accountId, subscription) {
      const user = data.users.find((u) => u.stripeAccountId === accountId);
      if (!user) return null;
      user.subscription = subscription;
      save();
      return user;
    },
  };
}
