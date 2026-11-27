/**
 * S-12 P3 (normalizer): webhook `smb_app_state_sync` dan `history` — bentuk resmi Meta (dibaca 26 Nov 2026), BSUID (F1-03), penolakan 2593109, aset media terpisah.
 */
import { describe, expect, it } from "vitest";
import { normalizePayload, type NormalizedEvent } from "@/modules/whatsapp-adapter/normalize";
import { BUSINESS_DISPLAY, CUSTOMER, envelope } from "../helpers/whatsapp";
import { contactSyncChange, histMsg, histThread, historyDeclined, historyFull, historyMediaAsset, syncContact } from "../helpers/s12";

const kinds = (evs: NormalizedEvent[]) => evs.map((e) => e.kind);
const only = <K extends NormalizedEvent["kind"]>(evs: NormalizedEvent[], k: K) => evs.filter((e): e is Extract<NormalizedEvent, { kind: K }> => e.kind === k);

describe("@tahap-2 S-12 P3 smb_app_state_sync: satu event per kontak, bentuk resmi", () => {
  it("add dengan nama + nomor + BSUID + username → ContactSyncItem lengkap; nomor diambil digitnya; cap waktu dari metadata.timestamp", () => {
    const evs = normalizePayload(envelope([contactSyncChange([syncContact({ full: "Budi Santoso", first: "Budi", phone: `+${CUSTOMER}`, userId: "BSUID.UJI.1", username: "budi.uji", ts: "1738346006" })])]));
    expect(kinds(evs)).toEqual(["contact_sync"]);
    expect(only(evs, "contact_sync")[0]).toMatchObject({ count: 1, contact: { action: "add", fullName: "Budi Santoso", firstName: "Budi", phone: CUSTOMER, userId: "BSUID.UJI.1", username: "budi.uji", ts: "2025-01-31T17:53:26.000Z" } });
  });
  it("remove: tanpa nama; nomor dihilangkan Meta (hanya BSUID) → phone null, userId terbaca", () => {
    const [e] = only(normalizePayload(envelope([contactSyncChange([syncContact({ action: "remove", userId: "BSUID.UJI.2" })])])), "contact_sync");
    expect(e?.contact).toMatchObject({ action: "remove", fullName: null, phone: null, userId: "BSUID.UJI.2" });
  });
  it("banyak kontak dalam satu webhook → satu event per kontak, kunci event unik dan stabil (idempoten); bukan nilai mentah (tanpa nomor/nama pada kunci)", () => {
    const payload = envelope([contactSyncChange([syncContact({ full: "A", phone: CUSTOMER, ts: "1738346006" }), syncContact({ full: "B", phone: "15550001002", ts: "1738346006" }), syncContact({ full: "A", phone: CUSTOMER, action: "remove", ts: "1738346006" })])]);
    const a = normalizePayload(payload), b = normalizePayload(payload);
    expect(a.map((e) => e.eventKey)).toEqual(b.map((e) => e.eventKey));
    expect(new Set(a.map((e) => e.eventKey)).size).toBe(3);
    for (const e of a) { expect(e.eventKey).toMatch(/^cs:[0-9a-f]{32}$/); expect(e.eventKey).not.toContain(CUSTOMER); }
    // ubah nama (suntingan baru, cap waktu berbeda) → kunci baru agar perubahan diproses
    const edited = normalizePayload(envelope([contactSyncChange([syncContact({ full: "A (baru)", phone: CUSTOMER, ts: "1738346999" })])]));
    expect(a.map((e) => e.eventKey)).not.toContain(edited[0]?.eventKey);
  });
  it("action asing / tanpa pengenal sama sekali → tetap satu event (ingest yang memutuskan); jenis state_sync selain 'contact' → karantina 'unknown'; entri rusak tidak melempar", () => {
    const evs = normalizePayload(envelope([contactSyncChange([syncContact({ action: "ubah", phone: CUSTOMER }), { type: "label", label: {} }, "bukan-objek", null, 5])]));
    expect(only(evs, "contact_sync")[0]?.contact?.action).toBeNull();
    expect(evs.filter((e) => e.kind === "unknown")).toHaveLength(4); // label + 3 entri rusak tidak hilang diam-diam
    expect(() => normalizePayload(envelope([{ field: "smb_app_state_sync", value: { state_sync: "salah" } }]))).not.toThrow();
  });
  it("state_sync kosong → satu event hitungan 0 (bentuk lama tetap terbaca); event antrean LAMA tanpa `contact` tetap tipe sah", () => {
    const [e] = only(normalizePayload(envelope([contactSyncChange([])])), "contact_sync");
    expect(e).toMatchObject({ count: 0 });
    expect(e?.contact).toBeUndefined();
  });
});

describe("@tahap-2 S-12 P3 history: fase 0/1/2, chunk, progres, BSUID, penolakan, aset media", () => {
  const first = <K extends NormalizedEvent["kind"]>(evs: NormalizedEvent[], k: K) => only(evs, k);
  it("metadata fase/chunk/progres → event progres; tiap fase 0, 1, 2 terbaca; potongan tidak berurutan tidak masalah", () => {
    for (const phase of [0, 1, 2]) {
      const evs = normalizePayload(envelope([historyFull([histThread({ id: CUSTOMER, messages: [histMsg(`wamid.uji.p${phase}`, { from: CUSTOMER })] })], { phase, chunk_order: 3 - phase, progress: 10 + phase * 40 })]));
      const prog = first(evs, "history").find((e) => !e.message);
      expect(prog && "progress" in prog ? prog.progress : null, `fase ${phase}`).toMatchObject({ phase, chunk: 3 - phase, progress: 10 + phase * 40, errorCode: null });
      expect(first(evs, "history").filter((e) => e.message)).toHaveLength(1);
    }
  });
  it("arah pesan: dari nomor bisnis → keluar; dari pelanggan → masuk; `from_user_id` (pengguna tanpa nomor) → masuk; `to` hadir (echo) → keluar; tanpa petunjuk apa pun → null (bukan ditebak)", () => {
    const t = histThread({ id: CUSTOMER, messages: [
      histMsg("wamid.uji.d1", { from: BUSINESS_DISPLAY }), histMsg("wamid.uji.d2", { from: CUSTOMER }), histMsg("wamid.uji.d3", { fromUserId: "BSUID.UJI.3" }),
      histMsg("wamid.uji.d4", { from: "15550007777", to: CUSTOMER }), histMsg("wamid.uji.d5", {}),
    ] });
    const dir = Object.fromEntries(first(normalizePayload(envelope([historyFull([t], { phase: 0, chunk_order: 1, progress: 5 })])), "history").filter((e) => e.message).map((e) => [e.message!.id, e.direction]));
    expect(dir).toEqual({ "wamid.uji.d1": "keluar", "wamid.uji.d2": "masuk", "wamid.uji.d3": "masuk", "wamid.uji.d4": "keluar", "wamid.uji.d5": null });
  });
  it("pesan ber-`to` (echo Business App) → keluar BAHKAN bila nomor bisnis tak diketahui dan thread tanpa nomor pelanggan (bukti `to` berdiri sendiri; bukan ditebak)", () => {
    const payload = { object: "whatsapp_business_account", entry: [{ id: "100000000000001", changes: [{ field: "history", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "200000000000001" }, history: [{ metadata: { phase: 0, chunk_order: 1, progress: 5 }, threads: [{ context: { user_id: "BSUID.UJI.7" }, messages: [{ from: "15550000001", to: CUSTOMER, id: "wamid.uji.to1", timestamp: "1739230955", type: "text", text: { body: "x" } }] }] }] } }] }] };
    const [m] = first(normalizePayload(payload), "history").filter((x) => x.message);
    expect(m).toMatchObject({ direction: "keluar", customer: null, customerUserId: "BSUID.UJI.7" });
  });
  it("BSUID (F1-03): thread tanpa `id` tetapi dengan context.user_id (+ wa_id) → identitas dari context; `from_user_id` pesan terbawa; username tidak dipakai sebagai identitas", () => {
    const t = histThread({ context: { wa_id: CUSTOMER, user_id: "BSUID.UJI.4", username: "peserta.uji" }, messages: [histMsg("wamid.uji.b1", { fromUserId: "BSUID.UJI.4" })] });
    const [e] = first(normalizePayload(envelope([historyFull([t], { phase: 1, chunk_order: 1, progress: 50 })])), "history").filter((x) => x.message);
    expect(e).toMatchObject({ customer: CUSTOMER, customerUserId: "BSUID.UJI.4", fromUserId: "BSUID.UJI.4", direction: "masuk" });
    const t2 = histThread({ context: { user_id: "BSUID.UJI.5" }, messages: [histMsg("wamid.uji.b2", { fromUserId: "BSUID.UJI.5" })] });
    const [e2] = first(normalizePayload(envelope([historyFull([t2], { phase: 1, chunk_order: 1, progress: 50 })])), "history").filter((x) => x.message);
    expect(e2).toMatchObject({ customer: null, customerUserId: "BSUID.UJI.5" });
  });
  it("`id` thread dan context.wa_id BERTENTANGAN → identityConflict (identitas tidak dipercaya dan tidak digabung); keduanya sama → aman", () => {
    const bad = histThread({ id: CUSTOMER, context: { wa_id: "15550009999", user_id: "BSUID.UJI.6" }, messages: [histMsg("wamid.uji.c1", { from: CUSTOMER })] });
    const [e] = first(normalizePayload(envelope([historyFull([bad], { phase: 0, chunk_order: 1, progress: 5 })])), "history").filter((x) => x.message);
    expect(e).toMatchObject({ identityConflict: true, customer: null, customerUserId: null });
    const ok = histThread({ id: CUSTOMER, context: { wa_id: CUSTOMER, user_id: "BSUID.UJI.6" }, messages: [histMsg("wamid.uji.c2", { from: CUSTOMER })] });
    expect(first(normalizePayload(envelope([historyFull([ok], { phase: 0, chunk_order: 1, progress: 5 })])), "history").find((x) => x.message)).toMatchObject({ customer: CUSTOMER, customerUserId: "BSUID.UJI.6" });
  });
  it("media_placeholder (fase lama, tanpa ID aset) → pesan 'tidak didukung' tanpa media; teks tetap terbaca", () => {
    const t = histThread({ id: CUSTOMER, messages: [histMsg("wamid.uji.m1", { from: BUSINESS_DISPLAY, type: "media_placeholder" }), histMsg("wamid.uji.m2", { from: CUSTOMER, text: "terima kasih" })] });
    const evs = first(normalizePayload(envelope([historyFull([t], { phase: 2, chunk_order: 1, progress: 90 })])), "history").filter((x) => x.message);
    expect(evs[0]?.message).toMatchObject({ type: "unsupported", rawType: "media_placeholder", media: null, text: null });
    expect(evs[1]?.message).toMatchObject({ type: "text", text: "terima kasih" });
  });
  it("pemilik menolak berbagi (kode 2593109) → event progres berkode galat; bukan karantina", () => {
    const evs = normalizePayload(envelope([historyDeclined()]));
    expect(kinds(evs)).toEqual(["history"]);
    const e = first(evs, "history")[0]!;
    expect(e.message).toBeUndefined();
    expect("progress" in e && e.progress).toMatchObject({ errorCode: 2593109, phase: null, progress: null });
  });
  it("aset media TERPISAH (field history + messages[]) → dikarantina sebagai 'unknown' dengan alasan khusus; nomor/ID media TIDAK ikut tersimpan pada payload karantina", () => {
    const evs = normalizePayload(envelope([historyMediaAsset("wamid.uji.a1", CUSTOMER, "media.hist.1")]));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ kind: "unknown", reason: "history_media_tidak_diproses", field: "history" });
    expect(JSON.stringify(evs[0]).includes(CUSTOMER)).toBe(false);
    expect(JSON.stringify(evs[0]).includes("media.hist.1")).toBe(false);
  });
  it("payload history rusak tidak melempar dan tidak menghilangkan event lain", () => {
    expect(() => normalizePayload(envelope([{ field: "history", value: { metadata: {}, history: "salah" } }]))).not.toThrow();
    expect(() => normalizePayload(envelope([{ field: "history", value: { history: [{ threads: [null, 5, { messages: "x" }, { context: 7, messages: [null] }] }] } }]))).not.toThrow();
  });
});
