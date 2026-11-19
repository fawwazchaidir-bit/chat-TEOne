"use client";
import { useState, type FormEvent } from "react";
import { Feedback, useAction } from "./client";

export type PermMeta = { key: string; label: string; channelScoped: boolean; available: boolean; superAdminOnlyGrant?: boolean };
export type ChannelLite = { id: string; name: string };
export type RoleLite = { id: string; name: string };
type GrantIn = { permission: string; effect?: string; scopeAll: boolean; channelIds: string[] };

// ───────────── Pengguna ─────────────
export function CreateUserForm({ roles, canAssignRoles, isSuperAdmin }: { roles: RoleLite[]; canAssignRoles: boolean; isSuperAdmin: boolean }) {
  const a = useAction();
  const [f, setF] = useState({ email: "", name: "", password: "", totpRequired: false });
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await a.run("POST", "/api/v1/users", { ...f, ...(roleIds.length ? { roleIds } : {}), ...(isSuperAdmin ? {} : { totpRequired: undefined }) }, { success: "Pengguna dibuat. Sampaikan kata sandi sementara lewat saluran aman; pengguna wajib menggantinya saat login pertama.", onOk: () => { setF({ email: "", name: "", password: "", totpRequired: false }); setRoleIds([]); } });
  };
  return (
    <form onSubmit={submit} className="card" aria-label="Buat pengguna">
      <h3>Buat pengguna</h3>
      <div className="row">
        <div><label htmlFor="cu-name">Nama</label><input id="cu-name" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label htmlFor="cu-email">Email</label><input id="cu-email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label htmlFor="cu-pw">Kata sandi sementara (min. 12)</label><input id="cu-pw" type="password" autoComplete="new-password" required minLength={12} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
      </div>
      {canAssignRoles && roles.length > 0 && (
        <fieldset style={{ border: 0, padding: 0, margin: ".5rem 0" }}><legend className="small" style={{ fontWeight: 600 }}>Peran awal</legend>
          {roles.map((r) => <label key={r.id} className="check"><input type="checkbox" checked={roleIds.includes(r.id)} onChange={(e) => setRoleIds(e.target.checked ? [...roleIds, r.id] : roleIds.filter((x) => x !== r.id))} /> {r.name}</label>)}
        </fieldset>
      )}
      {isSuperAdmin && <label className="check"><input type="checkbox" checked={f.totpRequired} onChange={(e) => setF({ ...f, totpRequired: e.target.checked })} /> Wajibkan 2FA untuk pengguna ini</label>}
      <Feedback error={a.error} ok={a.ok} />
      <p><button type="submit" disabled={a.pending}>Buat pengguna</button></p>
    </form>
  );
}

export function UserProfileForm({ user, isSuperAdmin }: { user: { id: string; name: string; email: string; totpRequired: boolean }; isSuperAdmin: boolean }) {
  const a = useAction();
  const [f, setF] = useState({ name: user.name, email: user.email, totpRequired: user.totpRequired });
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); void a.run("PATCH", `/api/v1/users/${user.id}`, isSuperAdmin ? f : { name: f.name, email: f.email }, { success: "Identitas disimpan." }); }}>
      <h3>Identitas dasar</h3>
      <div className="row">
        <div><label htmlFor="up-n">Nama</label><input id="up-n" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label htmlFor="up-e">Email</label><input id="up-e" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      </div>
      {isSuperAdmin && <label className="check"><input type="checkbox" checked={f.totpRequired} onChange={(e) => setF({ ...f, totpRequired: e.target.checked })} /> Wajibkan 2FA untuk pengguna ini</label>}
      <Feedback error={a.error} ok={a.ok} />
      <p><button type="submit" disabled={a.pending}>Simpan</button></p>
    </form>
  );
}

export function UserSecurityActions({ user, self, actorIsSuperAdmin }: { user: { id: string; status: string; isSuperAdmin: boolean; totpEnabled: boolean }; self: boolean; actorIsSuperAdmin: boolean }) {
  const a = useAction();
  const [pw, setPw] = useState("");
  const active = user.status === "active";
  const locked = self || (user.isSuperAdmin && !actorIsSuperAdmin);
  return (
    <div className="card">
      <h3>Status & pemulihan akun</h3>
      {locked && <p className="small muted">{self ? "Tindakan pada akun sendiri tidak tersedia di sini." : "Akun Super Admin hanya dapat diubah oleh Super Admin."}</p>}
      <div className="row" style={{ alignItems: "center" }}>
        <button className={active ? "danger auto" : "auto"} disabled={a.pending || locked} onClick={() => { if (!active || confirm("Nonaktifkan pengguna ini? Semua sesi aktifnya akan dicabut.")) void a.run("PUT", `/api/v1/users/${user.id}/status`, { active: !active }, { success: active ? "Pengguna dinonaktifkan; sesi dicabut." : "Pengguna diaktifkan." }); }}>
          {active ? "Nonaktifkan" : "Aktifkan"}
        </button>
        <button className="secondary auto" disabled={a.pending || locked || !user.totpEnabled} title={user.totpEnabled ? "" : "2FA belum aktif"} onClick={() => { if (confirm("Reset 2FA pengguna ini? Semua sesinya dicabut dan ia harus mendaftar ulang.")) void a.run("POST", `/api/v1/users/${user.id}/reset-2fa`, {}, { success: "2FA direset." }); }}>Reset 2FA</button>
        {actorIsSuperAdmin && !self && (
          <button className="secondary auto" disabled={a.pending} onClick={() => { if (confirm(user.isSuperAdmin ? "Cabut hak Super Admin?" : "Jadikan Super Admin? Ia akan wajib memakai 2FA.")) void a.run("PUT", `/api/v1/users/${user.id}/super-admin`, { value: !user.isSuperAdmin }, { success: "Hak Super Admin diubah." }); }}>
            {user.isSuperAdmin ? "Cabut Super Admin" : "Jadikan Super Admin"}
          </button>
        )}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void a.run("POST", `/api/v1/users/${user.id}/reset-password`, { newPassword: pw }, { success: "Kata sandi sementara diatur; sesi dicabut; pengguna wajib menggantinya.", onOk: () => setPw("") }); }}>
        <label htmlFor="rp">Reset kata sandi (sandi sementara, min. 12 karakter)</label>
        <div className="row"><input id="rp" type="password" autoComplete="new-password" minLength={12} required disabled={locked} value={pw} onChange={(e) => setPw(e.target.value)} /><button className="auto" type="submit" disabled={a.pending || locked}>Atur sandi sementara</button></div>
      </form>
      <Feedback error={a.error} ok={a.ok} />
    </div>
  );
}

export function UserRolesForm({ userId, roles, current, disabled }: { userId: string; roles: RoleLite[]; current: string[]; disabled: boolean }) {
  const a = useAction();
  const [sel, setSel] = useState(current);
  return (
    <div className="card">
      <h3>Peran</h3>
      {roles.length === 0 && <p className="muted small">Belum ada peran.</p>}
      {roles.map((r) => <label key={r.id} className="check"><input type="checkbox" disabled={disabled} checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /> {r.name}</label>)}
      {disabled && <p className="small muted">Anda tidak dapat mengubah peran untuk akun ini.</p>}
      <Feedback error={a.error} ok={a.ok} />
      <p><button disabled={a.pending || disabled} onClick={() => void a.run("PUT", `/api/v1/users/${userId}/roles`, { roleIds: sel }, { success: "Peran disimpan." })}>Simpan peran</button></p>
    </div>
  );
}

// ───────────── Editor izin (peran & per pengguna) ─────────────
type GS = { effect: "none" | "allow" | "deny"; scopeAll: boolean; channelIds: string[] };
export function GrantEditor({ mode, permissions, channels, initial, saveUrl, canGrantSuperAdminOnly, disabled }: { mode: "role" | "user"; permissions: PermMeta[]; channels: ChannelLite[]; initial: GrantIn[]; saveUrl: string; canGrantSuperAdminOnly: boolean; disabled?: boolean }) {
  const a = useAction();
  const [state, setState] = useState<Record<string, GS>>(() => {
    const s: Record<string, GS> = {};
    for (const p of permissions) {
      const g = initial.find((x) => x.permission === p.key && (x.effect ?? "allow") === "allow") ?? initial.find((x) => x.permission === p.key);
      s[p.key] = g ? { effect: (g.effect ?? "allow") as GS["effect"], scopeAll: g.scopeAll, channelIds: g.channelIds } : { effect: "none", scopeAll: true, channelIds: [] };
    }
    return s;
  });
  const set = (k: string, patch: Partial<GS>) => setState((s) => ({ ...s, [k]: { ...s[k]!, ...patch } }));
  // Izin yang punya entri 'allow' DAN 'deny' sekaligus (hanya dapat dibuat lewat API) tidak dapat dinyatakan di editor satu-efek ini.
  // Baris itu dikunci dan dikirim ulang apa adanya agar tidak ada yang hilang diam-diam saat menyimpan.
  const multi = new Set(mode === "user" ? permissions.filter((p) => initial.filter((x) => x.permission === p.key).length > 1).map((p) => p.key) : []);
  const save = () => {
    const kept = initial.filter((g) => multi.has(g.permission));
    const grants = permissions.filter((p) => !multi.has(p.key) && state[p.key]!.effect !== "none").map((p) => {
      const g = state[p.key]!;
      const scopeAll = p.channelScoped ? g.scopeAll : true;
      return { permission: p.key, ...(mode === "user" ? { effect: g.effect } : {}), scopeAll, channelIds: scopeAll ? [] : g.channelIds };
    });
    void a.run("PUT", saveUrl, { grants: [...grants, ...kept] }, { success: "Izin disimpan." });
  };
  return (
    <div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Izin (aksi)</th><th>{mode === "user" ? "Efek" : "Diberikan"}</th><th>Cakupan channel</th></tr></thead>
          <tbody>
            {permissions.map((p) => {
              const g = state[p.key]!;
              const blocked = disabled || (p.superAdminOnlyGrant && !canGrantSuperAdminOnly) || multi.has(p.key);
              return (
                <tr key={p.key}>
                  <td>{p.label}{!p.available && <> <span className="badge na">Belum tersedia</span></>}{p.superAdminOnlyGrant && <> <span className="badge warn">Hanya Super Admin</span></>}<div className="small muted mono">{p.key}</div></td>
                  <td>
                    {mode === "role" ? (
                      <input type="checkbox" aria-label={`Berikan ${p.label}`} disabled={blocked} checked={g.effect === "allow"} onChange={(e) => set(p.key, { effect: e.target.checked ? "allow" : "none" })} />
                    ) : (
                      <select aria-label={`Efek ${p.label}`} disabled={blocked} value={g.effect} onChange={(e) => set(p.key, { effect: e.target.value as GS["effect"] })}>
                        <option value="none">— (ikut peran)</option><option value="allow">Izinkan</option><option value="deny">TOLAK (mengalahkan peran)</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {multi.has(p.key) ? <span className="small muted">Kombinasi izin + penolakan — hanya dapat diubah lewat API; dipertahankan saat menyimpan.</span> : g.effect === "none" ? <span className="muted">—</span> : !p.channelScoped ? <span className="muted small">Global (tidak per channel)</span> : (
                      <>
                        <label className="check"><input type="radio" name={`sc-${p.key}`} disabled={blocked} checked={g.scopeAll} onChange={() => set(p.key, { scopeAll: true })} /> Semua channel</label>
                        <label className="check"><input type="radio" name={`sc-${p.key}`} disabled={blocked} checked={!g.scopeAll} onChange={() => set(p.key, { scopeAll: false })} /> Channel tertentu</label>
                        {!g.scopeAll && (
                          <div className="scope">
                            {channels.length === 0 && <span className="small muted">Belum ada channel yang dapat Anda lihat.</span>}
                            {channels.map((c) => <label key={c.id} className="check"><input type="checkbox" disabled={blocked} checked={g.channelIds.includes(c.id)} onChange={(e) => set(p.key, { channelIds: e.target.checked ? [...g.channelIds, c.id] : g.channelIds.filter((x) => x !== c.id) })} /> {c.name}</label>)}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Feedback error={a.error} ok={a.ok} />
      <p><button disabled={a.pending || disabled} onClick={save}>Simpan izin</button></p>
    </div>
  );
}

// ───────────── Peran ─────────────
export function CreateRoleForm() {
  const a = useAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); void a.run("POST", "/api/v1/roles", { name, description }, { success: "Peran dibuat. Atur izinnya di bawah.", onOk: () => { setName(""); setDescription(""); } }); }}>
      <h3>Buat peran</h3>
      <div className="row"><div><label htmlFor="rn">Nama peran</label><input id="rn" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></div><div><label htmlFor="rd">Keterangan</label><input id="rd" value={description} onChange={(e) => setDescription(e.target.value)} /></div></div>
      <Feedback error={a.error} ok={a.ok} />
      <p><button type="submit" disabled={a.pending}>Buat peran</button></p>
    </form>
  );
}

export function RoleMetaForm({ role, isSuperAdmin }: { role: { id: string; name: string; description: string; require2fa: boolean; isSystem: boolean; memberCount: number }; isSuperAdmin: boolean }) {
  const a = useAction();
  const [f, setF] = useState({ name: role.name, description: role.description, require2fa: role.require2fa });
  return (
    <div>
      <div className="row">
        <div><label htmlFor={`m-n-${role.id}`}>Nama</label><input id={`m-n-${role.id}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label htmlFor={`m-d-${role.id}`}>Keterangan</label><input id={`m-d-${role.id}`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      </div>
      {isSuperAdmin && <label className="check"><input type="checkbox" checked={f.require2fa} onChange={(e) => setF({ ...f, require2fa: e.target.checked })} /> Wajibkan 2FA untuk semua pemegang peran ini</label>}
      <p className="row" style={{ alignItems: "center" }}>
        <button className="secondary auto" disabled={a.pending} onClick={() => void a.run("PATCH", `/api/v1/roles/${role.id}`, isSuperAdmin ? f : { name: f.name, description: f.description }, { success: "Peran disimpan." })}>Simpan nama/keterangan</button>
        {!role.isSystem && <button className="danger auto" disabled={a.pending} onClick={() => { if (confirm(`Hapus peran "${role.name}"?`)) void a.run("DELETE", `/api/v1/roles/${role.id}`, undefined, { success: "Peran dihapus." }); }}>Hapus peran</button>}
        <span className="small muted">{role.memberCount} pengguna{role.isSystem && " · peran awal (tidak dapat dihapus)"}</span>
      </p>
      <Feedback error={a.error} ok={a.ok} />
    </div>
  );
}

// ───────────── Tim ─────────────
export function CreateTeamForm() {
  const a = useAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); void a.run("POST", "/api/v1/teams", { name, description }, { success: "Tim dibuat.", onOk: () => { setName(""); setDescription(""); } }); }}>
      <h3>Buat tim</h3>
      <div className="row"><div><label htmlFor="tn">Nama tim</label><input id="tn" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></div><div><label htmlFor="td">Keterangan</label><input id="td" value={description} onChange={(e) => setDescription(e.target.value)} /></div></div>
      <Feedback error={a.error} ok={a.ok} />
      <p><button type="submit" disabled={a.pending}>Buat tim</button></p>
    </form>
  );
}

export function TeamEditor({ team, users, channels }: { team: { id: string; name: string; description: string; isActive: boolean; memberIds: string[]; channelIds: string[] }; users: { id: string; name: string; email: string }[]; channels: ChannelLite[] }) {
  const a = useAction();
  const [members, setMembers] = useState(team.memberIds);
  const [chans, setChans] = useState(team.channelIds);
  const toggle = (list: string[], set: (v: string[]) => void, id: string, on: boolean) => set(on ? [...list, id] : list.filter((x) => x !== id));
  return (
    <div>
      <div className="row">
        <div><strong>Anggota</strong>{users.map((u) => <label key={u.id} className="check"><input type="checkbox" checked={members.includes(u.id)} onChange={(e) => toggle(members, setMembers, u.id, e.target.checked)} /> {u.name} <span className="muted small">{u.email}</span></label>)}</div>
        <div><strong>Channel yang ditangani</strong>{channels.length === 0 && <div className="small muted">Tidak ada channel yang dapat Anda lihat.</div>}{channels.map((c) => <label key={c.id} className="check"><input type="checkbox" checked={chans.includes(c.id)} onChange={(e) => toggle(chans, setChans, c.id, e.target.checked)} /> {c.name}</label>)}</div>
      </div>
      <Feedback error={a.error} ok={a.ok} />
      <p className="row" style={{ alignItems: "center" }}>
        <button className="auto" disabled={a.pending} onClick={async () => { const r1 = await a.run("PUT", `/api/v1/teams/${team.id}/members`, { userIds: members }, { refresh: false }); if (r1.ok) await a.run("PUT", `/api/v1/teams/${team.id}/channels`, { channelIds: chans }, { success: "Tim disimpan." }); }}>Simpan anggota & channel</button>
        <button className="secondary auto" disabled={a.pending} onClick={() => void a.run("PATCH", `/api/v1/teams/${team.id}`, { isActive: !team.isActive }, { success: team.isActive ? "Tim dinonaktifkan." : "Tim diaktifkan." })}>{team.isActive ? "Nonaktifkan tim" : "Aktifkan tim"}</button>
      </p>
    </div>
  );
}

// ───────────── Channel ─────────────
const KINDS = [["cloud_api_coexistence", "Cloud API — Coexistence"], ["cloud_api_only", "Cloud API — API saja"]] as const;
export function CreateChannelForm({ slotsFull }: { slotsFull: boolean }) {
  const a = useAction();
  const [f, setF] = useState({ name: "", functionLabel: "", description: "", integrationKind: "cloud_api_coexistence" });
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); void a.run("POST", "/api/v1/channels", f, { success: "Channel dibuat dengan status “Belum dikonfigurasi”. Tidak ada koneksi WhatsApp yang dibuat.", onOk: () => setF({ ...f, name: "", functionLabel: "", description: "" }) }); }}>
      <h3>Tambah channel</h3>
      {slotsFull && <p className="small muted">Slot channel aktif penuh. Arsipkan channel lain atau naikkan batas di Pengaturan organisasi.</p>}
      <div className="row">
        <div><label htmlFor="cn">Nama</label><input id="cn" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label htmlFor="cf">Fungsi (bebas: Admisi, Hotline, Finance…)</label><input id="cf" required minLength={2} value={f.functionLabel} onChange={(e) => setF({ ...f, functionLabel: e.target.value })} /></div>
        <div><label htmlFor="ck">Jenis integrasi rencana</label><select id="ck" value={f.integrationKind} onChange={(e) => setF({ ...f, integrationKind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <label htmlFor="cd">Keterangan</label><input id="cd" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <Feedback error={a.error} ok={a.ok} />
      <p><button type="submit" disabled={a.pending}>Tambah channel</button></p>
    </form>
  );
}

export function ChannelActions({ channel, canManage }: { channel: { id: string; name: string; functionLabel: string; description: string; integrationKind: string; archivedAt: string | null }; canManage: boolean }) {
  const a = useAction();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ name: channel.name, functionLabel: channel.functionLabel, description: channel.description, integrationKind: channel.integrationKind });
  if (!canManage) return <span className="muted small">Hanya lihat</span>;
  return (
    <div>
      <div className="row" style={{ gap: ".4rem" }}>
        {!channel.archivedAt && <button className="secondary auto" onClick={() => setEdit(!edit)}>{edit ? "Tutup" : "Ubah"}</button>}
        <button className={channel.archivedAt ? "auto" : "danger auto"} disabled={a.pending} onClick={() => { if (channel.archivedAt || confirm(`Arsipkan "${channel.name}"? Slot dibebaskan; jejak audit tetap.`)) void a.run("POST", `/api/v1/channels/${channel.id}/${channel.archivedAt ? "unarchive" : "archive"}`, {}, { success: channel.archivedAt ? "Channel dipulihkan." : "Channel diarsipkan." }); }}>{channel.archivedAt ? "Pulihkan" : "Arsipkan"}</button>
      </div>
      {edit && (
        <form onSubmit={(e) => { e.preventDefault(); void a.run("PATCH", `/api/v1/channels/${channel.id}`, f, { success: "Channel disimpan.", onOk: () => setEdit(false) }); }}>
          <label>Nama<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Fungsi<input value={f.functionLabel} onChange={(e) => setF({ ...f, functionLabel: e.target.value })} /></label>
          <label>Jenis integrasi<select value={f.integrationKind} onChange={(e) => setF({ ...f, integrationKind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Keterangan<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <p><button type="submit" disabled={a.pending}>Simpan</button></p>
        </form>
      )}
      <Feedback error={a.error} ok={a.ok} />
    </div>
  );
}

// ───────────── Pengaturan organisasi ─────────────
export function OrgSettingsForm({ maxChannels, timezone, activeChannels, canEdit }: { maxChannels: number; timezone: string; activeChannels: number; canEdit: boolean }) {
  const a = useAction();
  const [f, setF] = useState({ maxChannels, timezone });
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); void a.run("PATCH", "/api/v1/org-settings", { maxChannels: Number(f.maxChannels), timezone: f.timezone }, { success: "Pengaturan disimpan." }); }}>
      <div className="row">
        <div><label htmlFor="mc">Batas channel aktif</label><input id="mc" type="number" min={1} max={100} disabled={!canEdit} value={f.maxChannels} onChange={(e) => setF({ ...f, maxChannels: Number(e.target.value) })} /><div className="small muted">Sedang aktif: {activeChannels}. Batas ditegakkan di database. Tidak boleh lebih kecil dari jumlah aktif.</div></div>
        <div><label htmlFor="tz">Zona waktu bisnis</label><input id="tz" disabled={!canEdit} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /><div className="small muted">Contoh: Asia/Jakarta, Asia/Makassar, Asia/Jayapura.</div></div>
      </div>
      {!canEdit && <p className="small muted">Hanya Super Admin yang dapat mengubah pengaturan organisasi.</p>}
      <Feedback error={a.error} ok={a.ok} />
      {canEdit && <p><button type="submit" disabled={a.pending}>Simpan pengaturan</button></p>}
    </form>
  );
}

// ───────────── Kill switch & feature flag ─────────────
type KS = { id: string; scopeType: string; scopeRef: string; engaged: boolean; reason: string; engagedAt: string | null; releasedAt: string | null };
export function KillSwitchPanel({ items, channels, features }: { items: KS[]; channels: ChannelLite[]; features: { key: string; label: string }[] }) {
  const a = useAction();
  const [reason, setReason] = useState("");
  const [chat, setChat] = useState("");
  const on = (t: string, ref = "") => items.find((i) => i.scopeType === t && i.scopeRef === ref)?.engaged ?? false;
  const toggle = (scope: { type: string; ref?: string }, engaged: boolean) => {
    if (engaged && !reason.trim()) return a.setError("Isi alasan terlebih dahulu (wajib saat mengaktifkan).");
    void a.run("PUT", "/api/v1/kill-switch", { scope, engaged, reason }, { success: engaged ? "Kill switch DIAKTIFKAN — otomatisasi pada cakupan ini dihentikan." : "Kill switch dilepas oleh Anda (tindakan tercatat di audit)." });
  };
  const Row = ({ label, scope, engaged }: { label: string; scope: { type: string; ref?: string }; engaged: boolean }) => (
    <tr><td>{label}</td><td>{engaged ? <span className="badge bad">MENYALA — otomatisasi berhenti</span> : <span className="badge ok">Normal</span>}</td>
      <td><button className={engaged ? "secondary" : "danger"} disabled={a.pending} onClick={() => toggle(scope, !engaged)}>{engaged ? "Lepas" : "Hentikan"}</button></td></tr>
  );
  return (
    <div>
      <div className="card"><label htmlFor="ks-r">Alasan (wajib saat menghentikan; tercatat di audit)</label><input id="ks-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. pesan salah kirim, uji darurat" /><Feedback error={a.error} ok={a.ok} /></div>
      <div className="card tablewrap"><table><thead><tr><th>Cakupan</th><th>Status</th><th /></tr></thead><tbody>
        <Row label="GLOBAL — semua otomatisasi" scope={{ type: "global" }} engaged={on("global")} />
        {channels.map((c) => <Row key={c.id} label={`Channel: ${c.name}`} scope={{ type: "channel", ref: c.id }} engaged={on("channel", c.id)} />)}
        {features.map((f) => <Row key={f.key} label={`Fitur: ${f.label}`} scope={{ type: "feature", ref: f.key }} engaged={on("feature", f.key)} />)}
        {items.filter((i) => i.scopeType === "chat").map((i) => <Row key={i.id} label={`Chat: ${i.scopeRef}`} scope={{ type: "chat", ref: i.scopeRef }} engaged={i.engaged} />)}
      </tbody></table></div>
      <form className="card" onSubmit={(e) => { e.preventDefault(); toggle({ type: "chat", ref: chat.trim() }, true); setChat(""); }}>
        <label htmlFor="ks-c">Hentikan otomatisasi untuk satu chat (ID chat)</label>
        <div className="row"><input id="ks-c" required value={chat} onChange={(e) => setChat(e.target.value)} /><button className="danger auto" type="submit" disabled={a.pending}>Hentikan chat ini</button></div>
        <p className="small muted">Belum ada chat di Tahap 1; ID chat bersifat opak dan akan dipakai setelah Tahap 2–3.</p>
      </form>
    </div>
  );
}

export function FeatureFlagPanel({ flags }: { flags: { key: string; label: string; stage: number; enabled: boolean }[] }) {
  const a = useAction();
  return (
    <div className="card tablewrap">
      <Feedback error={a.error} ok={a.ok} />
      <table><thead><tr><th>Fitur</th><th>Tahap</th><th>Status (lingkungan ini)</th><th /></tr></thead><tbody>
        {flags.map((f) => (
          <tr key={f.key}><td>{f.label}<div className="small muted mono">{f.key}</div></td><td>{f.stage}</td>
            <td>{f.enabled ? <span className="badge warn">AKTIF</span> : <span className="badge na">Mati (default)</span>}</td>
            <td><button className="secondary" disabled={a.pending} onClick={() => void a.run("PUT", "/api/v1/feature-flags", { key: f.key, enabled: !f.enabled }, { success: `Flag “${f.key}” ${f.enabled ? "dimatikan" : "dinyalakan"}.` })}>{f.enabled ? "Matikan" : "Nyalakan"}</button></td></tr>
        ))}
      </tbody></table>
      <p className="small muted">Menyalakan flag untuk fitur yang belum dibuat tidak memunculkan fitur apa pun. Flag disimpan per database sehingga terpisah per lingkungan.</p>
    </div>
  );
}
