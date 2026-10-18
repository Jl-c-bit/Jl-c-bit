// Customer data deletion, for requests made under the privacy policy.
import fs from "node:fs";
import path from "node:path";

// Returns a matcher for a phone number as a customer might write it.
// "+61 412 345 678" / "61412345678" match exactly; local "0412 345 678" matches any country code.
export function phoneMatcher(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length < 8) throw new Error(`"${input}" doesn't look like a full phone number`);
  if (digits.startsWith("0")) {
    const local = digits.slice(1);
    return (stored) => String(stored).endsWith(local);
  }
  return (stored) => String(stored) === digits;
}

// Removes every order from that customer in each business's orders file.
// Returns { [businessId]: removedCount } for files that had matches.
export function forgetCustomer(ordersDir, phone) {
  const matches = phoneMatcher(phone);
  const removed = {};
  if (!fs.existsSync(ordersDir)) return removed;

  for (const name of fs.readdirSync(ordersDir).filter((n) => n.endsWith(".jsonl"))) {
    const file = path.join(ordersDir, name);
    // The server may append an order while we rewrite; retry if the file changed underneath us.
    for (let attempt = 0; ; attempt++) {
      const raw = fs.readFileSync(file, "utf8");
      const lines = raw.split("\n").filter(Boolean);
      const kept = lines.filter((l) => !matches(JSON.parse(l).customer));
      if (kept.length === lines.length) break;
      fs.writeFileSync(file + ".tmp", kept.map((l) => l + "\n").join(""));
      if (fs.readFileSync(file, "utf8") !== raw) {
        fs.rmSync(file + ".tmp");
        if (attempt < 5) continue;
        throw new Error(`${name} kept changing; try again`);
      }
      fs.renameSync(file + ".tmp", file);
      removed[name.slice(0, -".jsonl".length)] = lines.length - kept.length;
      break;
    }
  }
  return removed;
}
