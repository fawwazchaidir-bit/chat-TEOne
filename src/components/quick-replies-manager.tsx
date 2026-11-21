"use client";
import { useState, type FormEvent } from "react";
import { Badge } from "./ui";
import { Feedback, useAction } from "./client";

type QR = { id: string; title: string; body: string; channelId: string | null; teamId: string | null; isActive: boolean };

export function QuickRepliesManager({ items, channels, canAll, variables }: { items: QR[]; channels: { id: string; name: string }[]; canAll: boolean; variables: string[] }) {
  const a = useAction();
  const [f, setF] = useState({ title: "", body: "", channelId: canAll ? "" : (channels[0]?.id ?? "") });
  const [edit, setEdit] = useState<{ id: string; title: string; body: string } | null>(null);
  const name = (id: string | null) => (id ? (channels.find((c) => c.id === id)?.name ?? "Channel lain") : "Semua channel");
  const create = async (e: FormEvent) => { e.preventDefault(); const r = await a.run("POST", "/api/v1/quick-replies", { title: f.title, body: f.body, channelId: f.channelId || null }, { success: "Balasan cepat dibuat." }); if (r.ok) setF({ ...f, title: "", body: "" }); };
  return (
    <>
      <form className="card" onSubmit={create} aria-label="Buat balasan cepat">
        <h2 style={{ marginTop: 0 }}>Buat balasan cepat</h2>
        <div className="row">
          <div><label htmlFor="qr-title">Judul</label><input id="qr-title" value={f.title} maxLength={80} required onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><label htmlFor="qr-ch">Berlaku untuk</label>
            <select id="qr-ch" value={f.channelId} onChange={(e) => setF({ ...f, channelId: e.target.value })}>{canAll && <option value="">Semua channel</option>}{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        <label htmlFor="qr-body">Isi</label>
        <textarea id="qr-body" rows={3} maxLength={1000} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <p className="small muted">Variabel aman: {variables.map((v) => <code key={v} className="mono">{`{${v}}`}</code>).reduce<React.ReactNode[]>((acc, el, k) => (k ? [...acc, ", ", el] : [el]), [])}. Variabel lain ditolak (tidak akan terkirim apa adanya ke pelanggan).</p>
        <Feedback error={a.error} ok={a.ok} />
        <button type="submit" disabled={a.pending}>Simpan</button>
      </form>
      <div className="card tablewrap">
        <table>
          <thead><tr><th>Judul</th><th>Isi</th><th>Berlaku untuk</th><th>Status</th><th /></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="muted">Belum ada balasan cepat.</td></tr>}
            {items.map((q) => (
              <tr key={q.id}>
                <td>{edit?.id === q.id ? <input aria-label="Judul" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /> : q.title}</td>
                <td style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{edit?.id === q.id ? <textarea aria-label="Isi" rows={3} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /> : q.body}</td>
                <td>{name(q.channelId)}</td>
                <td>{q.isActive ? <Badge kind="ok">Aktif</Badge> : <Badge kind="na">Nonaktif</Badge>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {edit?.id === q.id ? (
                    <><button type="button" disabled={a.pending} onClick={async () => { const r = await a.run("PATCH", `/api/v1/quick-replies/${q.id}`, { title: edit.title, body: edit.body }, { success: "Disimpan." }); if (r.ok) setEdit(null); }}>Simpan</button> <button type="button" className="secondary" onClick={() => setEdit(null)}>Batal</button></>
                  ) : (
                    <><button type="button" className="secondary" onClick={() => setEdit({ id: q.id, title: q.title, body: q.body })}>Ubah</button> <button type="button" className="secondary" disabled={a.pending} onClick={() => void a.run("PATCH", `/api/v1/quick-replies/${q.id}`, { isActive: !q.isActive }, { success: q.isActive ? "Dinonaktifkan." : "Diaktifkan." })}>{q.isActive ? "Nonaktifkan" : "Aktifkan"}</button></>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
