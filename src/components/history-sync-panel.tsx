"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "./ui";
import { Feedback, Notice, useAction, useApi, describeError } from "./client";

type SyncType = "smb_app_state_sync" | "history";
type Check = { key: string; ok: boolean | null; label: string; detail: string | null };
type Req = { syncType: SyncType; status: "diminta" | "diterima_meta" | "gagal" | "belum_pasti"; stuck: boolean; label: string; requestedAt: string; completedAt: string | null; attempts: number; httpStatus: number | null; metaCode: number | null; failureKind: string | null; resolution: string | null; hasRequestId: boolean };
export type HistorySyncView =
  | { available: false }
  | { available: true; configured: false; channelName: string }
  | {
      available: true; configured: true; channelName: string; realEndpoint: boolean; canAct: boolean;
      onboarding: { at: string | null; source: string | null; remainingSec: number | null; label: string };
      requests: Req[];
      checks: Record<SyncType, Check[]>;
      progress: { phase: number | null; chunk: number | null; progress: number | null; errorCode: number | null; errorTitle: string | null; declined: boolean; complete: boolean; phasesSeen: number[]; updatedAt: string | null; label: string | null };
      stats: { contactEvents: number; historyMessages: number };
    };

const STEP: Record<SyncType, { title: string; what: string }> = {
  smb_app_state_sync: { title: "Step 1 — Sinkronisasi kontak", what: "Meta mengirim daftar kontak buku alamat Business App lewat webhook smb_app_state_sync." },
  history: { title: "Step 2 — Sinkronisasi riwayat", what: "Meta mengirim riwayat chat (≤ 180 hari, fase 0/1/2) lewat webhook history — hanya bila pemilik bisnis setuju berbagi." },
};
const STATUS_KIND: Record<Req["status"], "ok" | "warn" | "bad"> = { diterima_meta: "ok", diminta: "warn", belum_pasti: "bad", gagal: "bad" };
const STATUS_TEXT: Record<Req["status"], string> = { diterima_meta: "Permintaan diterima Meta — hasil menyusul lewat webhook", diminta: "Sedang diminta (belum ada jawaban Meta)", belum_pasti: "BELUM PASTI — jangan diulang", gagal: "Ditolak/gagal — Meta menjawab galat" };
const wib = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 3600)} j ${Math.floor((Math.max(0, sec) % 3600) / 60)} m`;

/** Sisa jendela: snapshot server dikurangi waktu berjalan sejak dimuat (tampilan saja — penegakan SELALU di server/database). */
function useRemaining(initial: number | null) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    setLeft(initial);
    if (initial === null) return;
    const start = Date.now();
    const t = setInterval(() => setLeft(initial - (Date.now() - start) / 1000), 15_000);
    return () => clearInterval(t);
  }, [initial]);
  return left;
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="small" style={{ listStyle: "none", paddingLeft: 0 }}>
      {checks.map((c) => (
        <li key={c.key}>
          <Badge kind={c.ok === true ? "ok" : c.ok === false ? "bad" : "na"}>{c.ok === true ? "Terpenuhi" : c.ok === false ? "Belum" : "Saat kirim"}</Badge> <strong>{c.key}.</strong> {c.label}
          {c.detail && <span className="muted"> — {c.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

function OnboardingForm({ channelId, hasRequests }: { channelId: string; hasRequests: boolean }) {
  const a = useAction();
  const [v, setV] = useState("");
  const [re, setRe] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!v) return; void a.run("PUT", `/api/v1/channels/${channelId}/history-sync/onboarding`, { onboardedAt: new Date(`${v}:00+07:00`).toISOString(), reonboarded: re }, { success: "Jam onboarding disimpan sebagai isian admin ('dinyatakan admin')." }); }}>
      <label htmlFor={`onb-${channelId}`}>Jam selesai onboarding (WIB) — isian Anda, <strong>bukan bukti Meta</strong></label>
      <div className="row">
        <input id={`onb-${channelId}`} type="datetime-local" required value={v} onChange={(e) => setV(e.target.value)} />
        <button type="submit" className="auto secondary" disabled={a.pending || !v}>Nyatakan jam onboarding</button>
      </div>
      {hasRequests && <p className="small"><label><input type="checkbox" checked={re} onChange={(e) => setRe(e.target.checked)} /> Nomor di-onboard <strong>ULANG</strong> (offboarding + Embedded Signup lagi) — membuka satu siklus baru; pemetaan harus diperiksa ulang</label></p>}
      <Feedback error={a.error} ok={a.ok} />
    </form>
  );
}

function StepCard({ channelId, channelName, type, view }: { channelId: string; channelName: string; type: SyncType; view: Extract<HistorySyncView, { configured: true }> }) {
  const api = useApi();
  const router = useRouter();
  const a = useAction();
  const [open, setOpen] = useState(false);
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; label: string } | null>(null);
  const [resErr, setResErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const req = view.requests.find((r) => r.syncType === type) ?? null;
  const checks = view.checks[type];
  const blockers = checks.filter((c) => c.ok === false);
  const reusable = !!req && req.status === "gagal" && (req.failureKind === "tidak_dikirim" || req.resolution === "tidak_diproses");
  const canSend = view.canAct && blockers.length === 0 && !busy && !result;
  const resolvable = !!req && !reusable && (req.status === "belum_pasti" || req.status === "gagal" || (req.status === "diminta" && req.stuck));

  async function send() {
    setBusy(true); setResErr(null);
    const r = await api<{ status: string; label: string }>("POST", `/api/v1/channels/${channelId}/history-sync`, { syncType: type, confirmSubscribed: c1, confirmOnce: c2 });
    setBusy(false);
    if (r.ok) setResult({ status: r.data.status, label: r.data.label }); else setResErr(describeError(r.error));
    setOpen(false);
    router.refresh(); // status tersimpan di server tampil dari database (bukan dari tebakan layar)
  }

  return (
    <div className="card" aria-label={STEP[type].title}>
      <h4>{STEP[type].title} {req ? <Badge kind={STATUS_KIND[req.status]}>{req.status === "diminta" && req.stuck ? "BELUM PASTI — proses terhenti" : STATUS_TEXT[req.status]}</Badge> : <Badge kind="na">Belum diminta</Badge>}</h4>
      <p className="small muted">{STEP[type].what}</p>
      <CheckList checks={checks} />
      {req && (
        <p className="small">
          Diminta {wib(req.requestedAt)}{req.completedAt && <> · jawaban dicatat {wib(req.completedAt)}</>} · percobaan ke-{req.attempts}
          {req.httpStatus !== null && <> · HTTP {req.httpStatus}</>}{req.metaCode !== null && <> · kode Meta {req.metaCode}</>}{req.failureKind && <> · jenis: {req.failureKind}</>}
          {req.hasRequestId && <> · <Badge kind="ok">request_id tersimpan (rujukan dukungan Meta)</Badge></>}
          {req.resolution && <> · diselesaikan manual: <strong>{req.resolution === "diterima" ? "dinyatakan admin: diterima Meta" : "dinyatakan admin: tidak diproses Meta"}</strong></>}
        </p>
      )}
      {result && <Notice kind={result.status === "diterima_meta" ? "ok" : "warn"}>{result.label}. {result.status === "diterima_meta" ? "Belum ada data diterima sampai webhook tiba (lihat progres di bawah)." : "Jangan mengulang; selesaikan secara manual setelah ada bukti."}</Notice>}
      {resErr && <Notice kind="error">{resErr}</Notice>}
      {view.canAct ? (
        <>
          {!open ? (
            <p><button type="button" disabled={!canSend} onClick={() => setOpen(true)}>Jalankan {type === "smb_app_state_sync" ? "Step 1" : "Step 2"}…</button>{blockers.length > 0 && <span className="small muted"> Tombol terkunci: {blockers.map((b) => b.key).join(", ")} belum terpenuhi.</span>}</p>
          ) : (
            <div className="notice warn" role="group" aria-label="Konfirmasi ganda">
              <p><strong>Permintaan ke Meta ini HANYA SEKALI dan tidak dapat diulang.</strong> Salah langkah = offboarding nomor + onboarding ulang.</p>
              <p><label><input type="checkbox" checked={c1} onChange={(e) => setC1(e.target.checked)} /> Field <code>history</code>, <code>smb_app_state_sync</code>, dan <code>smb_message_echoes</code> SUDAH di-subscribe di aplikasi Meta TE One.</label></p>
              <p><label><input type="checkbox" checked={c2} onChange={(e) => setC2(e.target.checked)} /> Saya paham ini hanya sekali dan hasilnya tercatat di audit.</label></p>
              <p><label htmlFor={`typed-${channelId}-${type}`}>Ketik nama channel (<strong>{channelName}</strong>) untuk melanjutkan</label><input id={`typed-${channelId}-${type}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></p>
              <p className="row">
                <button type="button" className="auto" disabled={busy || !c1 || !c2 || typed.trim() !== channelName.trim()} onClick={() => void send()}>{busy ? "Mengirim…" : "Ya, kirim permintaan ke Meta"}</button>
                <button type="button" className="secondary auto" disabled={busy} onClick={() => { setOpen(false); setC1(false); setC2(false); setTyped(""); }}>Batal</button>
              </p>
            </div>
          )}
          {resolvable && (
            <details>
              <summary>Hasil tidak pasti? Selesaikan secara manual (teraudit)</summary>
              <p className="small muted">Hanya berdasarkan bukti di luar sistem (mis. webhook sudah tiba, atau jawaban dukungan Meta). Pernyataan Anda dicatat; tidak pernah otomatis.</p>
              <label htmlFor={`note-${channelId}-${type}`}>Catatan alasan (10–500 karakter)</label>
              <textarea id={`note-${channelId}-${type}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              <p className="row">
                <button type="button" className="secondary auto" disabled={a.pending || note.trim().length < 10} onClick={() => void a.run("POST", `/api/v1/channels/${channelId}/history-sync/resolve`, { syncType: type, outcome: "diterima", note }, { success: "Dicatat: dinyatakan admin — diterima Meta." })}>Meta MENERIMA (bukti ada)</button>
                <button type="button" className="secondary auto" disabled={a.pending || note.trim().length < 10} onClick={() => void a.run("POST", `/api/v1/channels/${channelId}/history-sync/resolve`, { syncType: type, outcome: "tidak_diproses", note }, { success: "Dicatat: dinyatakan admin — tidak diproses Meta. Boleh diminta sekali lagi." })}>Meta TIDAK memproses (bukti ada)</button>
              </p>
              <Feedback error={a.error} ok={a.ok} />
            </details>
          )}
        </>
      ) : <p className="small muted">Hanya Super Admin dengan sesi 2FA penuh dan izin sinkronisasi pada channel ini yang dapat menjalankan atau menyelesaikan langkah ini.</p>}
    </div>
  );
}

export function HistorySyncPanel({ channelId, channelName, view }: { channelId: string; channelName: string; view: HistorySyncView }) {
  const remaining = useRemaining(view.available && view.configured ? view.onboarding.remainingSec : null);
  if (!view.available) return <p className="small muted">Sinkronisasi kontak &amp; riwayat: <Badge kind="na">Belum tersedia · Tahap 2</Badge> — feature flag <code className="mono">history_sync</code> masih mati.</p>;
  if (!view.configured) return <p className="small muted">Petakan channel ke WABA/phone_number_id dan periksa koneksi terlebih dahulu (panel koneksi di atas).</p>;
  const p = view.progress;
  const hasReqs = view.requests.length > 0;
  return (
    <div aria-label="Sinkronisasi riwayat">
      <h3>Sinkronisasi kontak &amp; riwayat <Badge kind="warn">SEKALI — tidak dapat diulang</Badge> {view.realEndpoint ? <Badge kind="ok">Endpoint: Meta asli</Badge> : <Badge kind="sample">Endpoint: MOCK — hasil = SIMULASI</Badge>}</h3>
      <p className="small muted">Resmi (Meta, dibaca 26 Nov 2026): setelah onboarding hanya ada <strong>24 jam</strong> untuk Step 1 lalu Step 2, masing-masing <strong>sekali</strong>. TE One berhenti 30 menit sebelum jendela habis dan menegakkan batas ini di server/database, bukan di layar ini.</p>
      <div className="card">
        <p><strong>Jam onboarding:</strong> {view.onboarding.at ? <>{wib(view.onboarding.at)} WIB <Badge kind="warn">{view.onboarding.label}</Badge></> : <Badge kind="bad">Tidak diketahui</Badge>}</p>
        <p><strong>Sisa jendela 24 jam:</strong> {remaining === null ? <Badge kind="bad">tidak diketahui — sinkronisasi ditolak</Badge> : remaining <= 0 ? <Badge kind="bad">habis</Badge> : <Badge kind={remaining >= 1800 ? "ok" : "bad"}>{fmt(remaining)}{remaining < 1800 ? " — di bawah batas aman 30 menit" : ""}</Badge>} <span className="small muted">(snapshot jam database saat halaman dimuat; muat ulang untuk angka terbaru)</span></p>
        {view.canAct ? <OnboardingForm channelId={channelId} hasRequests={hasReqs} /> : <p className="small muted">Menyatakan jam onboarding memerlukan Super Admin dengan sesi 2FA penuh dan izin sinkronisasi pada channel ini.</p>}
      </div>
      <StepCard channelId={channelId} channelName={channelName} type="smb_app_state_sync" view={view} />
      <StepCard channelId={channelId} channelName={channelName} type="history" view={view} />
      <div className="card" aria-label="Progres sinkronisasi">
        <h4>Data yang benar-benar diterima</h4>
        <ul className="small">
          <li>Event kontak diproses: <strong>{view.stats.contactEvents}</strong>{view.stats.contactEvents === 0 && <span className="muted"> (belum ada)</span>}</li>
          <li>Pesan riwayat tersimpan: <strong>{view.stats.historyMessages}</strong>{view.stats.historyMessages === 0 && <span className="muted"> (belum ada)</span>}</li>
          <li>Progres riwayat: {p.declined ? <Badge kind="bad">Pemilik bisnis menolak berbagi riwayat (kode {p.errorCode ?? 2593109}) — Meta tidak akan mengirim riwayat</Badge> : p.progress === null ? <Badge kind="na">Belum ada webhook history</Badge> : <><Badge kind={p.complete ? "ok" : "warn"}>{p.progress}%{p.complete ? " — selesai (progres 100 dilaporkan Meta)" : " — berjalan"}</Badge> fase terjauh {p.phase ?? "?"} dari 0–2{p.phasesSeen.length > 0 && <> (fase diterima: {p.phasesSeen.join(", ")})</>}</>}{p.updatedAt && <span className="muted"> · diperbarui {wib(p.updatedAt)}</span>}</li>
        </ul>
        <p className="small muted">Riwayat dan kontak tidak memicu balasan otomatis, penghitung belum-dibaca, label, atau follow-up. Riwayat 90–180 hari tanpa ID media tersimpan tanpa media.</p>
      </div>
    </div>
  );
}
