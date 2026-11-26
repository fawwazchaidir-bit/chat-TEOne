/**
 * S-12 (sinkronisasi kontak & riwayat): tes unit deterministik — klasifikasi hasil SMB App Data API, prasyarat murni, penggabungan progres, penjaga statis.
 * Normalizer webhook (smb_app_state_sync / history) ada di bagian bawah berkas ini.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SMB_SYNC_TYPES, isSmbSyncType, metaCallProblem, requestSmbSync } from "@/modules/whatsapp-adapter/client";
import { HISTORY_SHARING_DECLINED_CODE, classifySmbSyncResult } from "@/modules/whatsapp-adapter/errors";
import { SYNC_MARGIN_MINUTES, evaluateSyncPrerequisites, isReusableRequest, mergeHistoryProgress, rejectionFor, type SyncFacts } from "@/modules/whatsapp-adapter/history-sync";

const root = path.resolve(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(f)) continue;
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const src = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => path.relative(root, f);

describe("@tahap-2 S-12 P1 klasifikasi hasil panggilan SMB App Data (tanpa bergantung pada teks pesan Meta)", () => {
  const http = (status: number, code: number | null = null) => ({ ok: false as const, kind: "http" as const, status, meta: { code, subcode: null } });
  it("200 + messaging_product=whatsapp + request_id → diterima; bentuk lain pada 200 → BELUM PASTI (tidak pernah 'diterima' tanpa respons sah)", () => {
    expect(classifySmbSyncResult({ ok: true, status: 200, data: { messaging_product: "whatsapp", request_id: "abc" } })).toEqual({ status: "diterima_meta", requestId: "abc" });
    for (const data of [{ messaging_product: "whatsapp" }, { request_id: "abc" }, { messaging_product: "lain", request_id: "abc" }, { messaging_product: "whatsapp", request_id: "" }, { messaging_product: "whatsapp", request_id: 5 }, null, "teks", []]) {
      expect(classifySmbSyncResult({ ok: true, status: 200, data }), JSON.stringify(data)).toMatchObject({ status: "belum_pasti", failureKind: "respons_tak_dikenal" });
    }
    expect(classifySmbSyncResult({ ok: true, status: 200, data: { messaging_product: "whatsapp", request_id: "x".repeat(201) } }).status).toBe("belum_pasti");
  });
  it("timeout/jaringan → belum pasti; 5xx atau kategori server_meta → belum pasti; 4xx (termasuk rate limit/token) → gagal", () => {
    expect(classifySmbSyncResult({ ok: false, kind: "timeout" })).toMatchObject({ status: "belum_pasti", failureKind: "timeout" });
    expect(classifySmbSyncResult({ ok: false, kind: "jaringan" })).toMatchObject({ status: "belum_pasti", failureKind: "jaringan" });
    for (const s of [500, 502, 503, 504]) expect(classifySmbSyncResult(http(s)), String(s)).toMatchObject({ status: "belum_pasti", failureKind: "http", httpStatus: s });
    expect(classifySmbSyncResult(http(400, 1))).toMatchObject({ status: "belum_pasti" }); // kode 1 = galat tak dikenal di sisi Meta, walau HTTP 4xx
    expect(classifySmbSyncResult(http(429, 4))).toMatchObject({ status: "gagal", label: "Batas kecepatan/kuota Meta tercapai" });
    expect(classifySmbSyncResult(http(400, 80007))).toMatchObject({ status: "gagal", label: "Batas kecepatan/kuota Meta tercapai" });
    expect(classifySmbSyncResult(http(401, 190))).toMatchObject({ status: "gagal", label: "Token akses Meta ditolak/kedaluwarsa" });
    expect(classifySmbSyncResult(http(400, 100))).toMatchObject({ status: "gagal", label: "Parameter permintaan tidak valid" });
    expect(classifySmbSyncResult(http(404, 12345))).toMatchObject({ status: "gagal", label: "Kesalahan Meta tidak dikenal" });
  });
  it("konfigurasi tidak lengkap → gagal 'tidak dikirim' (tidak ada panggilan); hasil bentuk tak terduga → belum pasti (gagal-aman)", () => {
    expect(classifySmbSyncResult({ ok: false, kind: "konfigurasi", detail: "x" })).toMatchObject({ status: "gagal", failureKind: "tidak_dikirim" });
    expect(classifySmbSyncResult({ ok: false, kind: "aneh" } as never).status).toBe("belum_pasti");
  });
  it("hasil klasifikasi tidak membawa teks pesan Meta mentah (hanya kode/kategori)", () => {
    const r = classifySmbSyncResult({ ok: false, kind: "http", status: 400, meta: { code: 100, subcode: null, message: "RAHASIA nomor 15550001001" } as never });
    expect(JSON.stringify(r)).not.toContain("RAHASIA");
  });
  it("2593109 = penolakan berbagi riwayat (konstanta dari dokumentasi resmi)", () => { expect(HISTORY_SHARING_DECLINED_CODE).toBe(2593109); });
});

describe("@tahap-2 S-12 P1 klien: gagal-aman dan tanpa percobaan ulang", () => {
  it("hanya dua sync_type yang sah; jenis lain / phone_number_id tidak valid → TIDAK memanggil jaringan (hasil 'konfigurasi')", async () => {
    expect([...SMB_SYNC_TYPES]).toEqual(["smb_app_state_sync", "history"]);
    expect(isSmbSyncType("history") && isSmbSyncType("smb_app_state_sync")).toBe(true);
    for (const bad of ["messages", "", undefined, null, "HISTORY"]) expect(isSmbSyncType(bad), String(bad)).toBe(false);
    expect(await requestSmbSync("200000000000001", "messages" as never)).toMatchObject({ ok: false, kind: "konfigurasi" });
    expect(await requestSmbSync("../x", "history")).toMatchObject({ ok: false, kind: "konfigurasi" });
  });
  it("metaCallProblem: tanpa token → alasan; basis URL tak aman → alasan; lengkap → null", () => {
    const base = { graphBaseUrl: "https://graph.facebook.com", apiVersion: "v23.0", appSecret: "s", verifyToken: "v", appId: "1", timeoutMs: 1000 };
    expect(metaCallProblem({ ...base, accessToken: undefined })).toMatch(/META_ACCESS_TOKEN/);
    expect(metaCallProblem({ ...base, accessToken: "t" })).toBeNull();
    expect(metaCallProblem({ ...base, accessToken: "t", graphBaseUrl: "http://graph.facebook.com" })).toMatch(/https/);
  });
  it("penjaga statis: tidak ada retry/loop pada jalur sinkronisasi; logika SMB App Data HANYA di whatsapp-adapter/client.ts", () => {
    const offenders = src.filter((f) => /smb_app_data/.test(readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual(["src/modules/whatsapp-adapter/client.ts"]);
    const callers = src.filter((f) => /requestSmbSync\(/.test(readFileSync(f, "utf8"))).map(rel).sort();
    expect(callers).toEqual(["src/modules/whatsapp-adapter/history-sync.ts"]); // satu-satunya pemanggil; definisinya di client.ts
    const sync = read("src/modules/whatsapp-adapter/history-sync.ts");
    expect(sync.match(/requestSmbSync\(/g)).toHaveLength(1); // satu pemanggilan saja
    expect(sync).not.toMatch(/\bwhile\s*\(|for\s*\(\s*;;|setTimeout|setInterval/); // tidak ada loop/penjadwal: tidak mungkin mengulang sendiri
  });
  it("migrasi 0006 expand-only: tidak ada DROP/DELETE/TRUNCATE/RENAME/ALTER TYPE; kolom baru nullable; UNIQUE 'sekali saja' ada", () => {
    const f = readdirSync(path.join(root, "drizzle")).find((x) => x.startsWith("0006_"));
    expect(f).toBeTruthy();
    const sql = read(`drizzle/${f}`);
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|RENAME)\b|(?<!ON )\bDELETE\b|ALTER COLUMN|SET NOT NULL/i); // "ON DELETE no action" pada FK baru bukan penghapusan data
    expect(sql).toMatch(/CREATE UNIQUE INDEX "smb_sync_requests_once" ON "smb_sync_requests" USING btree \("channel_id","sync_type","mapping_version"\)/);
    for (const col of ["coexistence_onboarded_at", "coexistence_onboarded_source", "coexistence_onboarded_by"]) expect(sql).toMatch(new RegExp(`ADD COLUMN "${col}" [a-z ]+;`)); // tanpa NOT NULL/DEFAULT
  });
});

const baseFacts = (over: Partial<SyncFacts> = {}): SyncFacts => ({
  flagConnector: true, flagHistorySync: true, actor: { isSuperAdmin: true, totpEnabled: true, scoped: true }, kill: { blocked: false },
  conn: { verificationStatus: "terverifikasi", verificationMode: "simulasi", testMode: true, onboardedAt: new Date() }, remainingSec: 20 * 3600,
  channel: { isOperational: false, archived: false, integrationKind: "cloud_api_coexistence" }, realEndpoint: false, appEnv: "test", tokenProblem: null,
  existing: null, step1Accepted: false, confirm: { subscribed: true, once: true }, ...over,
});
const failing = (t: "smb_app_state_sync" | "history", over: Partial<SyncFacts> = {}) => evaluateSyncPrerequisites(t, baseFacts(over)).filter((c) => c.ok === false).map((c) => c.key).join("");

describe("@tahap-2 S-12 P2 prasyarat murni a–j (satu sumber kebenaran untuk server DAN tampilan)", () => {
  it("semua terpenuhi → tidak ada yang gagal; urutan kunci a…j tetap", () => {
    expect(evaluateSyncPrerequisites("smb_app_state_sync", baseFacts()).map((c) => c.key).join("")).toBe("abcdefghij");
    expect(failing("smb_app_state_sync")).toBe("");
    expect(failing("history", { step1Accepted: true })).toBe("");
  });
  it("tiap prasyarat dapat menggagalkan sendiri", () => {
    expect(failing("smb_app_state_sync", { flagHistorySync: false })).toBe("a");
    expect(failing("smb_app_state_sync", { flagConnector: false })).toBe("a");
    expect(failing("smb_app_state_sync", { actor: { isSuperAdmin: false, totpEnabled: true, scoped: true } })).toBe("b");
    expect(failing("smb_app_state_sync", { actor: { isSuperAdmin: true, totpEnabled: false, scoped: true } })).toBe("b");
    expect(failing("smb_app_state_sync", { actor: { isSuperAdmin: true, totpEnabled: true, scoped: false } })).toBe("b");
    expect(failing("smb_app_state_sync", { kill: { blocked: true, by: "global" } })).toBe("c");
    expect(failing("smb_app_state_sync", { conn: { ...baseFacts().conn, verificationStatus: "gagal" } })).toBe("d");
    expect(failing("smb_app_state_sync", { existing: { status: "diterima_meta", failureKind: null, resolution: null } })).toBe("f");
    expect(failing("history")).toBe("g");
    expect(failing("smb_app_state_sync", { confirm: { subscribed: false, once: true } })).toBe("h");
    expect(failing("smb_app_state_sync", { channel: { ...baseFacts().channel, isOperational: true } })).toBe("i"); // guard-operational:allow — uji penolakan
    expect(failing("smb_app_state_sync", { channel: { ...baseFacts().channel, integrationKind: "cloud_api_only" } })).toBe("j");
    expect(failing("smb_app_state_sync", { tokenProblem: "META_ACCESS_TOKEN belum diisi" })).toBe("j");
  });
  it("(d) mode verifikasi harus SAMA dengan endpoint: Meta asli ⇒ 'nyata'; mock ⇒ 'simulasi'", () => {
    expect(failing("smb_app_state_sync", { realEndpoint: true })).toBe("d"); // simulasi di endpoint asli
    expect(failing("smb_app_state_sync", { realEndpoint: true, conn: { ...baseFacts().conn, verificationMode: "nyata" } })).toBe("");
    expect(failing("smb_app_state_sync", { conn: { ...baseFacts().conn, verificationMode: "nyata" } })).toBe("d"); // nyata di mock
  });
  it(`(e) batas jendela: sisa ≥ ${SYNC_MARGIN_MINUTES} menit boleh; kurang → ditolak; tak diketahui → ditolak`, () => {
    const m = SYNC_MARGIN_MINUTES * 60;
    expect(failing("smb_app_state_sync", { remainingSec: m })).toBe("");
    expect(failing("smb_app_state_sync", { remainingSec: m - 1 })).toBe("e");
    expect(failing("smb_app_state_sync", { remainingSec: 0 })).toBe("e");
    expect(failing("smb_app_state_sync", { remainingSec: -5 })).toBe("e");
    expect(failing("smb_app_state_sync", { conn: { ...baseFacts().conn, onboardedAt: null }, remainingSec: null })).toBe("e");
    expect(failing("smb_app_state_sync", { remainingSec: null })).toBe("e"); // sisa tak terhitung = tidak diketahui
    expect(failing("smb_app_state_sync", { remainingSec: Number.NaN })).toBe("e");
  });
  it("(i) di non-production mode uji wajib; di production tidak diwajibkan oleh (i) tetapi operasional tetap ditolak", () => {
    expect(failing("smb_app_state_sync", { conn: { ...baseFacts().conn, testMode: false } })).toBe("i");
    expect(failing("smb_app_state_sync", { appEnv: "development", conn: { ...baseFacts().conn, testMode: false } })).toBe("i");
    expect(failing("smb_app_state_sync", { appEnv: "production", conn: { ...baseFacts().conn, testMode: false } })).toBe("");
    expect(failing("smb_app_state_sync", { appEnv: "production", channel: { ...baseFacts().channel, isOperational: true } })).toBe("i"); // guard-operational:allow — uji penolakan
  });
  it("(f) baris yang boleh dipakai ulang HANYA yang terbukti tak sampai ke Meta atau dinyatakan admin 'tidak diproses'", () => {
    expect(isReusableRequest({ status: "gagal", failureKind: "tidak_dikirim", resolution: null })).toBe(true);
    expect(isReusableRequest({ status: "gagal", failureKind: "http", resolution: "tidak_diproses" })).toBe(true);
    for (const r of [{ status: "gagal", failureKind: "http", resolution: null }, { status: "belum_pasti", failureKind: "timeout", resolution: null }, { status: "diminta", failureKind: null, resolution: null }, { status: "diterima_meta", failureKind: null, resolution: null }, { status: "belum_pasti", failureKind: "http", resolution: "tidak_diproses" }]) {
      expect(isReusableRequest(r), JSON.stringify(r)).toBe(false);
    }
    expect(failing("smb_app_state_sync", { existing: { status: "gagal", failureKind: "tidak_dikirim", resolution: null } })).toBe("");
  });
  it("(h) konfirmasi tidak diketahui (tampilan) = null, bukan lulus; (g) tidak berlaku pada Step 1", () => {
    const c = evaluateSyncPrerequisites("smb_app_state_sync", baseFacts({ confirm: null }));
    expect(c.find((x) => x.key === "h")?.ok).toBeNull();
    expect(c.find((x) => x.key === "g")).toMatchObject({ ok: true, detail: "Tidak berlaku untuk Step 1" });
  });
  it("kode penolakan: flag mati → 404; izin → 403; lainnya → 409 dengan daftar yang gagal", () => {
    const rej = (over: Partial<SyncFacts>, t: "smb_app_state_sync" | "history" = "smb_app_state_sync") => rejectionFor(evaluateSyncPrerequisites(t, baseFacts(over)));
    expect(rej({ flagHistorySync: false }).status).toBe(404);
    expect(rej({ actor: { isSuperAdmin: false, totpEnabled: true, scoped: true } }).status).toBe(403);
    expect(rej({ flagHistorySync: false, actor: { isSuperAdmin: false, totpEnabled: true, scoped: true } }).status).toBe(404); // fitur seolah tidak ada
    const r = rej({ kill: { blocked: true, by: "global" } });
    expect([r.status, r.code]).toEqual([409, "SYNC_PREREQUISITE_FAILED"]);
    expect((r.details as { failed: { key: string }[] }).failed.map((x) => x.key)).toEqual(["c"]);
  });
});

describe("@tahap-2 S-12 P3 penggabungan progres history (murni): tidak turun, fase terjauh, penolakan 2593109 permanen", () => {
  const e = (phase: number | null, chunk: number | null, progress: number | null, errorCode: number | null = null, errorTitle: string | null = null) => ({ phase, chunk, progress, errorCode, errorTitle });
  const T = "2026-11-26T00:00:00.000Z";
  it("chunk tidak berurutan: progres memakai nilai tertinggi, fase = terjauh yang tiba, daftar fase terurut; 100 = selesai", () => {
    let p = mergeHistoryProgress({}, e(1, 2, 40), T);
    p = mergeHistoryProgress(p, e(0, 1, 10), T); // datang terlambat
    expect(p).toMatchObject({ phase: 1, chunk: 1, progress: 40, phasesSeen: [0, 1], complete: false, declined: false });
    p = mergeHistoryProgress(p, e(2, 1, 100), T);
    expect(p).toMatchObject({ phase: 2, progress: 100, phasesSeen: [0, 1, 2], complete: true });
    p = mergeHistoryProgress(p, e(0, 3, 55), T);
    expect(p).toMatchObject({ progress: 100, phase: 2, complete: true });
  });
  it("nilai di luar rentang dipotong 0–100; fase di luar 0/1/2 diabaikan; null tidak menimpa", () => {
    expect(mergeHistoryProgress({}, e(0, 1, 250), T).progress).toBe(100);
    expect(mergeHistoryProgress({}, e(0, 1, -5), T).progress).toBe(0);
    expect(mergeHistoryProgress({}, e(7, 1, 10), T)).toMatchObject({ phase: null, phasesSeen: [] });
    const p = mergeHistoryProgress({ phase: 1, chunk: 3, progress: 60, phasesSeen: [1] }, e(null, null, null), T);
    expect(p).toMatchObject({ phase: 1, chunk: 3, progress: 60 });
  });
  it("galat 2593109 → declined permanen (tidak pernah 'selesai' walau progres 100 datang kemudian); kode lain tidak menandai penolakan", () => {
    const p = mergeHistoryProgress({}, e(null, null, null, 2593109, "History sync is turned off"), T);
    expect(p).toMatchObject({ declined: true, errorCode: 2593109, complete: false });
    expect(mergeHistoryProgress(p, e(0, 1, 100), T)).toMatchObject({ declined: true, complete: false });
    expect(mergeHistoryProgress({}, e(null, null, null, 131000, "x"), T).declined).toBe(false);
  });
  it("masukan rusak (null/teks/angka) tidak melempar", () => {
    for (const bad of [null, undefined, "x", 5, [], { phasesSeen: "x", progress: "y" }]) expect(() => mergeHistoryProgress(bad, e(0, 1, 5), T), String(bad)).not.toThrow();
  });
});
