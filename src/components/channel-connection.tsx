"use client";
import { useState } from "react";
import { Badge } from "./ui";
import { Feedback, useAction } from "./client";

export type ConnView =
  | { configured: false }
  | { configured: true; wabaId: string; phoneNumberId: string; testMode: boolean; verificationStatus: string; verificationMode: string | null; verifiedAt: string | null; verificationDetail: { problems?: string[]; webhookSubscribed?: boolean | null; endpoint?: string; checkedAt?: string; phone?: { display?: string | null; verifiedName?: string | null } } };

/** Status koneksi — SELALU menyebut sumber bukti. "Terverifikasi" hanya bila pemeriksaan ke Graph API berhasil. */
export function ConnectionBadge({ v }: { v: ConnView }) {
  if (!v.configured) return <Badge kind="na">Belum dikonfigurasi</Badge>;
  if (v.verificationStatus === "terverifikasi") return v.verificationMode === "nyata" ? <Badge kind="ok">Terverifikasi — NYATA (Graph API Meta)</Badge> : <Badge kind="sample">Terverifikasi — SIMULASI (mock, bukan Meta)</Badge>;
  if (v.verificationStatus === "gagal") return <Badge kind="bad">Pemeriksaan gagal</Badge>;
  return <Badge kind="warn">Belum diperiksa</Badge>;
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
          {d.webhookSubscribed === true && <> · webhook: berlangganan</>}
          {d.webhookSubscribed === false && <> · <Badge kind="bad">webhook belum berlangganan</Badge></>}
        </p>
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
