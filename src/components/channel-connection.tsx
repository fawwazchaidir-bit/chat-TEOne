"use client";
import { useState } from "react";
import { Badge } from "./ui";
import { Feedback, useAction } from "./client";

type Subscription = "terkonfirmasi" | "ada_aplikasi_tidak_dipastikan" | "aplikasi_lain" | "tidak_berlangganan" | "tidak_diketahui";
export type ConnView =
  | { configured: false }
  | {
      configured: true; wabaId: string; phoneNumberId: string; testMode: boolean; verificationStatus: string; verificationMode: string | null; verifiedAt: string | null;
      verificationDetail: { problems?: string[]; webhookSubscribed?: boolean | null; subscription?: { state?: Subscription }; endpoint?: string; checkedAt?: string; phone?: { display?: string | null; verifiedName?: string | null } };
      readiness?: { state: "siap_menerima" | "belum_terbukti"; missing: string[]; subscription: Subscription | "belum_diperiksa"; lastEventAt: string | null };
    };

const SUB_LABEL: Record<Subscription | "belum_diperiksa", { kind: "ok" | "warn" | "bad" | "na"; text: string }> = {
  terkonfirmasi: { kind: "ok", text: "Terkonfirmasi untuk aplikasi TE One" },
  ada_aplikasi_tidak_dipastikan: { kind: "warn", text: "Ada langganan, aplikasi TE One tidak dapat dipastikan (isi META_APP_ID)" },
  aplikasi_lain: { kind: "bad", text: "Berlangganan ke aplikasi LAIN, bukan TE One" },
  tidak_berlangganan: { kind: "bad", text: "Aplikasi belum berlangganan ke WABA ini" },
  tidak_diketahui: { kind: "warn", text: "Tidak diketahui (pemeriksaan gagal)" },
  belum_diperiksa: { kind: "na", text: "Langganan belum diperiksa" },
};

/** Status PEMETAAN NOMOR — SELALU menyebut sumber bukti. Ini BUKAN bukti siap menerima pesan (lihat ReadinessBadge). */
export function ConnectionBadge({ v }: { v: ConnView }) {
  if (!v.configured) return <Badge kind="na">Belum dikonfigurasi</Badge>;
  if (v.verificationStatus === "terverifikasi") return v.verificationMode === "nyata" ? <Badge kind="ok">Pemetaan nomor terverifikasi — NYATA (Graph API Meta)</Badge> : <Badge kind="sample">Pemetaan nomor terverifikasi — SIMULASI (mock, bukan Meta)</Badge>;
  if (v.verificationStatus === "gagal") return <Badge kind="bad">Pemeriksaan gagal</Badge>;
  return <Badge kind="warn">Belum diperiksa</Badge>;
}

/** "Siap menerima pesan" hanya bila TIGA bukti terpisah ada: pemetaan nyata, langganan aplikasi terkonfirmasi, dan event benar-benar diterima. */
export function ReadinessBadge({ v }: { v: ConnView }) {
  if (!v.configured || !v.readiness) return null;
  return v.readiness.state === "siap_menerima" ? <Badge kind="ok">Siap menerima pesan — terbukti (pemetaan nyata + langganan terkonfirmasi + event diterima)</Badge> : <Badge kind="warn">Belum terbukti siap menerima pesan</Badge>;
}

export function ChannelConnectionPanel({ channelId, view, canManage }: { channelId: string; view: ConnView; canManage: boolean }) {
  const a = useAction();
  const [f, setF] = useState({ wabaId: view.configured ? view.wabaId : "", phoneNumberId: view.configured ? view.phoneNumberId : "" });
  const d = view.configured ? view.verificationDetail : {};
  return (
    <div className="card" aria-label="Koneksi WhatsApp">
      <h3>Koneksi WhatsApp (Meta Cloud API) <ConnectionBadge v={view} /></h3>
      <p className="small muted">Pemetaan channel ↔ WABA ↔ <code className="mono">phone_number_id</code>. Status hanya berubah setelah <strong>pemeriksaan nyata ke Graph API</strong>; tidak ada klaim koneksi tanpa bukti. Aplikasi Meta yang dipakai adalah milik TE One.</p>
      {view.configured && (
        <p className="small">
          Mode uji: {view.testMode ? <Badge kind="warn">Aktif — kirim hanya ke penerima uji</Badge> : <Badge>Nonaktif</Badge>}
          {view.verifiedAt && <> · diperiksa {new Date(view.verifiedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</>}
          {d.phone?.display && <> · nomor {d.phone.display}</>}
        </p>
      )}
      {view.configured && (
        <div className="small" aria-label="Bukti koneksi">
          <p><strong>Tiga bukti terpisah:</strong></p>
          <ul>
            <li>Pemetaan nomor: <ConnectionBadge v={view} /></li>
            <li>Langganan webhook aplikasi: <Badge kind={SUB_LABEL[view.readiness?.subscription ?? "belum_diperiksa"].kind}>{SUB_LABEL[view.readiness?.subscription ?? "belum_diperiksa"].text}</Badge></li>
            <li>Event diterima dari Meta (sejak pemetaan terakhir): {view.readiness?.lastEventAt ? <Badge kind="ok">Terakhir {new Date(view.readiness.lastEventAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</Badge> : <Badge kind="warn">Belum ada</Badge>}</li>
          </ul>
          <p><ReadinessBadge v={view} /></p>
          {view.readiness && view.readiness.state !== "siap_menerima" && <ul className="muted">{view.readiness.missing.map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>
      )}
      {(d.problems?.length ?? 0) > 0 && <ul className="small" style={{ color: "var(--bad)" }}>{d.problems!.map((p) => <li key={p}>{p}</li>)}</ul>}
      {canManage ? (
        <form onSubmit={(e) => { e.preventDefault(); void a.run("PUT", `/api/v1/channels/${channelId}/connection`, f, { success: "Pemetaan disimpan. Jalankan pemeriksaan untuk memverifikasi." }); }}>
          <div className="row">
            <div><label htmlFor={`waba-${channelId}`}>WABA ID</label><input id={`waba-${channelId}`} inputMode="numeric" required value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value })} /></div>
            <div><label htmlFor={`pn-${channelId}`}>phone_number_id</label><input id={`pn-${channelId}`} inputMode="numeric" required value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} /></div>
          </div>
          <Feedback error={a.error} ok={a.ok} />
          <p className="row" style={{ alignItems: "center" }}>
            <button type="submit" className="auto" disabled={a.pending}>Simpan pemetaan</button>
            <button type="button" className="secondary auto" disabled={a.pending || !view.configured} onClick={() => void a.run("POST", `/api/v1/channels/${channelId}/connection/verify`, {}, { success: "Pemeriksaan selesai — lihat status di atas." })}>Periksa koneksi</button>
          </p>
        </form>
      ) : <p className="small muted">Anda hanya dapat melihat; mengubah pemetaan memerlukan izin kelola channel.</p>}
    </div>
  );
}
