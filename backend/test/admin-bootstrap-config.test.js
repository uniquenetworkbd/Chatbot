const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ADMIN_USERNAME, readAdminCredentials } = require("../services/admin-bootstrap");

test("administrator identity is fixed and only ADMIN_PASSWORD is required", () => {
  const credentials = readAdminCredentials({
    ADMIN_PASSWORD: "test-password-at-least-12",
    ADMIN_USERNAME: "attacker-controlled-name"
  });
  assert.equal(ADMIN_USERNAME, "Raive");
  assert.deepEqual(credentials, {
    username: "Raive",
    password: "test-password-at-least-12"
  });
});

test("bootstrap rejects missing or invalid password secrets", () => {
  assert.throws(() => readAdminCredentials({}), /ADMIN_PASSWORD is required/);
  assert.throws(() => readAdminCredentials({ ADMIN_PASSWORD: "short" }), /12-1024 characters/);
  assert.throws(() => readAdminCredentials({ ADMIN_PASSWORD: "x".repeat(1025) }), /12-1024 characters/);
});
