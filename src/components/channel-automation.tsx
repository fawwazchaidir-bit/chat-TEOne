"use client";
import { useState } from "react";
import { Badge } from "./ui";
import { Feedback, useAction } from "./client";

export type ChannelAutomationView = { teams: { id: string; name: string }[]; paused: { reason: string | null; engagedAt: string | null } | null; canSetTeam: boolean; canPause: boolean };

/** Antrian default (tim awal percakapan baru) dan "Jeda otomatisasi channel" (kill switch tingkat channel). Server tetap memeriksa izin. */
export function ChannelAutomationControls({ channelId, defaultTeamId, view }: { channelId: string; defaultTeamId: string | null; view: ChannelAutomationView }) {
  const a = useAction();
  const [team, setTeam] = useState(defaultTeamId ?? "");
  const [reason, setReason] = useState("");
  return (
    <div className="card" aria-label="Antrian dan otomatisasi channel">
      <h3>Antrian default &amp; otomatisasi {view.paused && <Badge kind="bad">Otomatisasi DIJEDA</Badge>}</h3>
      <div className="row">
        <div>
          <label htmlFor={`dt-${channelId}`}>Tim antrian default (percakapan baru)</label>
          <select id={`dt-${channelId}`} value={team} disabled={!view.canSetTeam} onChange={(e) => setTeam(e.target.value)}>
            <option value="">— belum diatur —</option>
            {view.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="auto"><button type="button" className="secondary" disabled={!view.canSetTeam || a.pending || team === (defaultTeamId ?? "")} onClick={() => void a.run("PUT", `/api/v1/channels/${channelId}/default-team`, { teamId: team || null }, { success: "Tim default disimpan." })}>Simpan tim default</button></div>
      </div>
      {view.teams.length === 0 && <p className="small muted">Belum ada tim yang terhubung ke channel ini (atur di halaman Tim).</p>}
      <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "1rem 0" }} />
      {view.paused ? (
        <>
          <p className="small"><strong>Jeda otomatisasi channel menyala.</strong> Tidak ada pengiriman otomatis pada channel ini{view.paused.reason ? <> — alasan: {view.paused.reason}</> : null}. Jeda <strong>tidak pernah lepas sendiri</strong>; hanya pengguna berizin yang dapat melepasnya.</p>
          <button type="button" disabled={!view.canPause || a.pending} onClick={() => void a.run("PUT", `/api/v1/channels/${channelId}/automation-pause`, { engaged: false }, { success: "Jeda dilepas. Hanya pesan pelanggan baru yang diproses." })}>Lepas jeda</button>
        </>
      ) : (
        <>
          <label htmlFor={`pr-${channelId}`}>Alasan jeda (wajib)</label>
          <input id={`pr-${channelId}`} value={reason} maxLength={300} disabled={!view.canPause} onChange={(e) => setReason(e.target.value)} placeholder="mis. kampanye bermasalah, periksa dulu" />
          <button type="button" className="danger" style={{ marginTop: ".5rem" }} disabled={!view.canPause || a.pending || !reason.trim()} onClick={() => void a.run("PUT", `/api/v1/channels/${channelId}/automation-pause`, { engaged: true, reason }, { success: "Otomatisasi channel dijeda." }).then(() => setReason(""))}>Jeda otomatisasi channel</button>
          <p className="small muted" style={{ margin: ".3rem 0 0" }}>Menghentikan semua pengiriman otomatis (AI, follow-up) pada channel ini; balasan manual tetap berjalan.</p>
        </>
      )}
      {!view.canPause && <p className="small muted">Anda tidak berizin menjeda otomatisasi channel ini.</p>}
      <Feedback error={a.error} ok={a.ok} />
    </div>
  );
}
