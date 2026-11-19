import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { rawCall } from "../helpers/api";

afterAll(closeDb);

describe("@tahap-1 endpoint health", () => {
  it("hanya menampilkan informasi seperlunya (status), tanpa konfigurasi/versi/host", async () => {
    const r = await rawCall("GET", "/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "ok" });
    const text = JSON.stringify(r.body);
    for (const leak of ["postgres", "DATABASE", "localhost", "teone", "version", "key", "secret"]) expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
  });
});
