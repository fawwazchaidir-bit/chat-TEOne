"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "./ui";
import { ConnectionBadge, type ConnView } from "./channel-connection";
import { Feedback, Notice, describeError, useAction, useApi, useCsrf } from "./client";

type Msg = { id: string; direction: string; source: string; type: string; rawType: string | null; body: string | null; status: string | null; errorCategory: string | null; isHistory: boolean; providerTs: string | null; receivedAt: string; counterpart: string | null; mediaId: string | null; mediaStatus: string | null; windowOpen: boolean };
type Overview = { connection: ConnView; events: Record<string, number>; unlistedSenders24h: number; uncertainMessages: number; messages: Msg[] };
type Recipient = { id: string; label: string; identity: string; active: boolean };
type ProblemEvent = { id: number; kind: string; status: string; reason: string | null; attempts: number; lastError: string | null; receivedAt: string; hasPayload: boolean };
type Chan = { id: string; name: string };

const SOURCE: Record<string, [string, "ok" | "warn" | "bad" | "sample" | "na" | undefined]> = {
  pelanggan: ["Pelanggan", undefined], te_one: ["TE One", "ok"], whatsapp_business_app: ["WhatsApp Business App", "warn"], history: ["History", "na"],
};
const STATUS: Record<string, [string, "ok" | "warn" | "bad" | "na" | undefined]> = {
  diproses: ["Diproses", "na"], diterima_api: ["Diterima API", undefined], terkirim: ["Terkirim", undefined], diterima: ["Diterima", "ok"], dibaca: ["Dibaca", "ok"], gagal: ["Gagal", "bad"], belum_pasti: ["BELUM PASTI", "warn"],
};

export function IntegrationTool({ channels, canManageRecipients }: { channels: Chan[]; canManageRecipients: boolean }) {
  const api = useApi();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [ov, setOv] = useState<Overview | null>(null);
  const [events, setEvents] = useState<ProblemEvent[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!channelId) return;
    const [o, e, r] = await Promise.all([api<Overview>("GET", `/api/v1/integration/overview?channelId=${channelId}`), api<{ items: ProblemEvent[] }>("GET", `/api/v1/integration/events?channelId=${channelId}`), api<{ items: Recipient[] }>("GET", "/api/v1/integration/recipients")]);
    if (o.ok) { setOv(o.data); setError(null); } else setError(describeError(o.error));
    if (e.ok) setEvents(e.data.items);
    if (r.ok) setRecipients(r.data.items);
  }, [api, channelId]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);

  return (
    <div>
      <div className="card">
        <div className="row" style={{ alignItems: "center" }}>
          <div><label htmlFor="it-ch">Channel uji</label><select id="it-ch" value={channelId} onChange={(e) => setChannelId(e.target.value)}>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="auto"><button className="secondary" onClick={() => void load()}>Muat ulang</button></div>
        </div>
        {ov && <p style={{ margin: ".6rem 0 0" }}>Status koneksi: <ConnectionBadge v={ov.connection} /></p>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {ov && (
        <>
          <div className="grid">
            {(["pending", "processing", "processed", "failed", "quarantined"] as const).map((k) => <div className="card" key={k}><div className="muted small">Event {({ pending: "menunggu", processing: "diproses", processed: "selesai", failed: "gagal", quarantined: "dikarantina" })[k]}</div><div className="stat">{ov.events[k] ?? 0}</div></div>)}
            <div className="card"><div className="muted small">Pengirim di luar daftar uji (24 jam)</div><div className="stat">{ov.unlistedSenders24h}</div><div className="small muted">Tidak diproses otomatisasi; hanya dihitung.</div></div>
            <div className="card"><div className="muted small">Pesan BELUM PASTI</div><div className="stat">{ov.uncertainMessages}</div><div className="small muted">Tidak pernah dikirim ulang otomatis.</div></div>
          </div>
          <SendForm channelId={channelId} recipients={recipients.filter((r) => r.active)} onSent={load} />
          <Recipients items={recipients} canManage={canManageRecipients} onChanged={load} />
          <Messages messages={ov.messages} onChanged={load} />
          <ProblemEvents items={events} onChanged={load} />
        </>
      )}
    </div>
  );
}

function SendForm({ channelId, recipients, onSent }: { channelId: string; recipients: Recipient[]; onSent: () => Promise<void> }) {
  const csrf = useCsrf();
  const [recipientId, setRecipientId] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID()); // kunci idempotensi per formulir: klik ganda = permintaan yang sama
  const [pending, setPending] = useState(false);
  const [res, setRes] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true); setRes(null);
    const f = new FormData();
    const kind = file ? (file.type === "application/pdf" ? "document" : "image") : "text";
    f.set("channelId", channelId); f.set("recipientId", recipientId || recipients[0]?.id || ""); f.set("kind", kind); f.set("idempotencyKey", key);
    if (kind === "text") f.set("text", text); else { f.set("file", file as File); if (text) f.set("caption", text); }
    try {
      const r = await fetch("/api/v1/integration/send", { method: "POST", body: f, credentials: "same-origin", headers: csrf ? { "x-csrf-token": csrf } : {} });
      const j = await r.json().catch(() => null);
      if (!r.ok) setRes({ kind: "error", text: j?.error ? describeError(j.error) : "Pengiriman gagal." });
      else {
        const st = j.status as string;
        setRes({ kind: st === "belum_pasti" ? "warn" : st === "gagal" ? "error" : "ok", text: st === "belum_pasti" ? "HASIL BELUM PASTI — pesan mungkin sudah terkirim. Jangan kirim ulang; tunggu status webhook atau selesaikan manual setelah mengecek ponsel penerima." : st === "gagal" ? `Gagal: ${j.detail ?? j.errorCategory ?? "tidak diketahui"}` : j.duplicate ? "Permintaan sama sudah diproses sebelumnya (tidak dikirim ulang)." : "Diterima API Meta. Status akan diperbarui oleh webhook." });
        if (st !== "belum_pasti") { setKey(crypto.randomUUID()); setText(""); setFile(null); if (fileRef.current) fileRef.current.value = ""; }
        await onSent();
      }
    } catch { setRes({ kind: "error", text: "Tidak dapat menghubungi server." }); }
    setPending(false);
  };
  return (
    <form className="card" onSubmit={submit} aria-label="Kirim pesan uji">
      <h3>Kirim pesan uji</h3>
      <p className="small muted">Hanya ke penerima di <strong>daftar penerima uji</strong> (ditegakkan server). Pesan bebas hanya dalam jendela layanan 24 jam; di luar itu diblokir.</p>
      {recipients.length === 0 ? <Notice kind="warn">Belum ada penerima uji aktif. Tambahkan dulu di bagian “Penerima uji”.</Notice> : (
        <>
          <div className="row">
            <div><label htmlFor="sf-to">Penerima uji</label><select id="sf-to" value={recipientId || recipients[0]?.id} onChange={(e) => setRecipientId(e.target.value)}>{recipients.map((r) => <option key={r.id} value={r.id}>{r.label} ({r.identity})</option>)}</select></div>
            <div><label htmlFor="sf-file">Gambar (JPEG/PNG/WEBP) atau PDF — opsional</label><input id="sf-file" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <label htmlFor="sf-text">{file ? "Keterangan (opsional)" : "Teks pesan"}</label>
          <textarea id="sf-text" rows={3} maxLength={file ? 1024 : 4096} required={!file} value={text} onChange={(e) => setText(e.target.value)} />
          {res && <Notice kind={res.kind}>{res.text}</Notice>}
          <p><button type="submit" disabled={pending}>{pending ? "Mengirim…" : "Kirim"}</button></p>
        </>
      )}
    </form>
  );
}

function Recipients({ items, canManage, onChanged }: { items: Recipient[]; canManage: boolean; onChanged: () => Promise<void> }) {
  const a = useAction();
  const [label, setLabel] = useState("");
  const [identity, setIdentity] = useState("");
  return (
    <div className="card">
      <h3>Penerima uji</h3>
      <div className="tablewrap"><table><thead><tr><th>Label</th><th>Nomor (disamarkan)</th><th /></tr></thead><tbody>
        {items.length === 0 && <tr><td colSpan={3} className="muted">Belum ada.</td></tr>}
        {items.map((r) => <tr key={r.id}><td>{r.label} {!r.active && <Badge kind="na">Nonaktif</Badge>}</td><td className="mono">{r.identity}</td><td>{canManage && <button className="danger" disabled={a.pending} onClick={() => { if (confirm(`Hapus penerima uji “${r.label}”?`)) void a.run("DELETE", `/api/v1/integration/recipients/${r.id}`, undefined, { refresh: false, onOk: () => void onChanged() }); }}>Hapus</button>}</td></tr>)}
      </tbody></table></div>
      {canManage ? (
        <form onSubmit={(e) => { e.preventDefault(); void a.run("POST", "/api/v1/integration/recipients", { label, identity }, { refresh: false, success: "Penerima uji ditambahkan.", onOk: () => { setLabel(""); setIdentity(""); void onChanged(); } }); }}>
          <div className="row"><div><label htmlFor="rc-l">Label</label><input id="rc-l" required value={label} onChange={(e) => setLabel(e.target.value)} /></div><div><label htmlFor="rc-i">Nomor WhatsApp (format internasional, mis. 62…)</label><input id="rc-i" required inputMode="tel" autoComplete="off" value={identity} onChange={(e) => setIdentity(e.target.value)} /></div><div className="auto"><button type="submit" disabled={a.pending}>Tambah</button></div></div>
          <Feedback error={a.error} ok={a.ok} />
        </form>
      ) : <p className="small muted">Mengubah daftar penerima uji memerlukan izin alat uji di semua channel.</p>}
      <p className="small muted">Nomor lengkap tidak pernah dikirim kembali ke browser. Gunakan nomor peserta uji milik tim — bukan data pelanggan.</p>
    </div>
  );
}

/** Media privat: dimuat lewat endpoint berizin (bukan URL publik), sehingga <img> biasa dipakai, bukan optimizer next/image. */
function MediaImage({ id }: { id: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <div><img src={`/api/v1/media/${id}`} alt="Gambar pesan" style={{ maxWidth: 160, maxHeight: 120, borderRadius: 6, marginTop: 4 }} /></div>;
}

function Messages({ messages, onChanged }: { messages: Msg[]; onChanged: () => Promise<void> }) {
  const a = useAction();
  const [note, setNote] = useState<Record<string, string>>({});
  return (
    <div className="card">
      <h3>Pesan & status tersimpan <span className="small muted">(50 terbaru · bukan inbox operasional)</span></h3>
      <Feedback error={a.error} ok={a.ok} />
      <div className="tablewrap"><table><thead><tr><th>Waktu</th><th>Sumber</th><th>Isi</th><th>Status</th></tr></thead><tbody>
        {messages.length === 0 && <tr><td colSpan={4} className="muted">Belum ada pesan.</td></tr>}
        {messages.map((m) => {
          const [srcLabel, srcKind] = SOURCE[m.source] ?? [m.source, undefined];
          const [stLabel, stKind] = m.status ? (STATUS[m.status] ?? [m.status, undefined]) : ["—", undefined];
          return (
            <tr key={m.id}>
              <td className="small">{new Date(m.providerTs ?? m.receivedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}<div className="muted">{m.direction === "masuk" ? "masuk" : "keluar"} · {m.counterpart ?? "—"}</div></td>
              <td><Badge kind={srcKind}>{srcLabel}</Badge>{m.isHistory && <> <Badge kind="na">History</Badge></>}</td>
              <td>
                {m.type === "unsupported" ? <em className="muted">Jenis pesan belum didukung ({m.rawType ?? "?"})</em> : m.body ?? <span className="muted">(tanpa teks)</span>}
                {m.mediaId && m.mediaStatus === "tersimpan" && (m.type === "image" ? <MediaImage id={m.mediaId} /> : <div><a href={`/api/v1/media/${m.mediaId}`}>Unduh PDF</a></div>)}
                {m.mediaId && m.mediaStatus && m.mediaStatus !== "tersimpan" && <div className="small muted">Media: {m.mediaStatus}</div>}
              </td>
              <td>
                <Badge kind={stKind}>{stLabel}</Badge>{m.errorCategory && <div className="small muted">{m.errorCategory}</div>}
                {m.status === "belum_pasti" && (
                  <div style={{ marginTop: 6 }}>
                    <input aria-label="Catatan pengecekan" placeholder="Catatan hasil cek di ponsel peserta uji" value={note[m.id] ?? ""} onChange={(e) => setNote({ ...note, [m.id]: e.target.value })} />
                    <p className="row" style={{ marginTop: 4 }}>
                      {(["terkirim", "gagal"] as const).map((o) => <button key={o} className="secondary auto" disabled={a.pending || !(note[m.id] ?? "").trim()} onClick={() => void a.run("POST", `/api/v1/integration/messages/${m.id}/resolve`, { outcome: o, note: note[m.id] }, { refresh: false, onOk: () => void onChanged() })}>Tandai {o}</button>)}
                    </p>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody></table></div>
    </div>
  );
}

function ProblemEvents({ items, onChanged }: { items: ProblemEvent[]; onChanged: () => Promise<void> }) {
  const a = useAction();
  return (
    <div className="card">
      <h3>Event gagal / dikarantina</h3>
      <Feedback error={a.error} ok={a.ok} />
      <div className="tablewrap"><table><thead><tr><th>#</th><th>Jenis</th><th>Status</th><th>Alasan</th><th /></tr></thead><tbody>
        {items.length === 0 && <tr><td colSpan={5} className="muted">Tidak ada.</td></tr>}
        {items.map((e) => <tr key={e.id}><td className="mono">{e.id}</td><td>{e.kind}</td><td><Badge kind={e.status === "failed" ? "bad" : "warn"}>{e.status}</Badge> <span className="small muted">{e.attempts}×</span></td><td className="small">{e.reason ?? e.lastError ?? "—"}</td>
          <td>{e.hasPayload ? <button className="secondary" disabled={a.pending} onClick={() => void a.run("POST", `/api/v1/integration/events/${e.id}/retry`, {}, { refresh: false, success: "Event dijadwalkan ulang.", onOk: () => void onChanged() })}>Proses ulang</button> : <span className="small muted">payload dibuang</span>}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}
