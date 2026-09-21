import { describe, expect, it } from "vitest";

import {
  decryptCLIKey,
  deriveNodeKey,
  encryptCLIKey,
  sha256,
} from "../src/shared/crypto";

describe("Cloudflare crypto compatibility", () => {
  it("matches the Go HMAC-derived node-key format", async () => {
    const connectionKey = "clv_connect_aHR0cHM6Ly9hcGkuY2xvdmFwaS5jb20.AAAAAAAAAAAAAAAAAAAAAA";
    await expect(deriveNodeKey(
      connectionKey,
      "11111111-2222-3333-4444-555555555555",
      "0123456789abcdef",
      7,
    )).resolves.toBe("clv_node_0s3Tv8g_Gb3tkQbhJOooYqOKd7XVG0LQE9HXgQf9g3g");
    await expect(sha256(connectionKey)).resolves.toBe(
      "40e0257ee93b24ce8d3cdc1b15a43f72941e93f10719f9bf2c228c001235055a",
    );
  });

  it("round-trips the Go-compatible v1 CLI-key ciphertext envelope", async () => {
    const authSecret = "test-auth-secret-at-least-thirty-two-characters";
    const userId = "user-one";
    const plain = "clv_connect_aHR0cHM6Ly9hcGkuY2xvdmFwaS5jb20.AAAAAAAAAAAAAAAAAAAAAA";
    const encrypted = await encryptCLIKey(authSecret, userId, plain);
    expect(encrypted.split(".")).toHaveLength(4);
    await expect(decryptCLIKey(authSecret, userId, encrypted, await sha256(plain))).resolves.toBe(plain);
    await expect(decryptCLIKey(authSecret, "another-user", encrypted, await sha256(plain))).resolves.toBeNull();
  });
});
