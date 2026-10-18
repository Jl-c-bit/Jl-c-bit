import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { phoneMatcher, forgetCustomer } from "../privacy.js";

test("phone matcher handles international and local formats", () => {
  assert.equal(phoneMatcher("+61 412 345 678")("61412345678"), true);
  assert.equal(phoneMatcher("61412345678")("61412345679"), false);
  assert.equal(phoneMatcher("0412 345 678")("61412345678"), true, "local format ignores country code");
  assert.throws(() => phoneMatcher("123"), /full phone number/);
});

test("forget removes a customer's orders across businesses and keeps others", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forget-"));
  const line = (number, customer) => JSON.stringify({ number, customer }) + "\n";
  fs.writeFileSync(path.join(dir, "pizza.jsonl"), line(1, "61411111111") + line(2, "61422222222") + line(3, "61411111111"));
  fs.writeFileSync(path.join(dir, "cafe.jsonl"), line(1, "61422222222"));

  assert.deepEqual(forgetCustomer(dir, "0411 111 111"), { pizza: 2 });
  const left = fs.readFileSync(path.join(dir, "pizza.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(left, [{ number: 2, customer: "61422222222" }]);
  assert.equal(fs.readFileSync(path.join(dir, "cafe.jsonl"), "utf8"), line(1, "61422222222"));
  assert.deepEqual(forgetCustomer(dir, "+61411111111"), {}, "nothing left to remove");
  assert.deepEqual(forgetCustomer(path.join(dir, "missing"), "+61411111111"), {});
});
