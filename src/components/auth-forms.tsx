"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Feedback, Notice, useAction } from "./client";

export function LoginForm() {
  const router = useRouter();
  const a = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await a.run("POST", "/api/v1/auth/login", { email, password }, { refresh: false });
    if (r.ok) router.push("/");
  };
  return (
    <form onSubmit={submit} aria-label="Form login">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Kata sandi</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <Feedback error={a.error} ok={a.ok} />
      <p><button type="submit" disabled={a.pending}>{a.pending ? "Memproses…" : "Masuk"}</button></p>
    </form>
  );
}

export function TotpVerifyForm() {
  const router = useRouter();
  const a = useAction();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = recovery
      ? await a.run<{ remaining: number }>("POST", "/api/v1/auth/recovery", { code }, { refresh: false, onOk: (d) => setRemaining(d.remaining) })
      : await a.run("POST", "/api/v1/auth/totp/verify", { code }, { refresh: false });
    if (r.ok && !recovery) router.push("/");
  };
  if (remaining !== null)
    return (
      <>
        <Notice kind="warn">Kode pemulihan terpakai. Sisa kode pemulihan: <strong>{remaining}</strong>. Bila perangkat 2FA hilang, minta Super Admin mereset 2FA Anda dan daftarkan ulang.</Notice>
        <button onClick={() => router.push("/")}>Lanjut</button>
      </>
    );
  return (
    <form onSubmit={submit} aria-label="Verifikasi 2FA">
      <label htmlFor="code">{recovery ? "Kode pemulihan (sekali pakai)" : "Kode 6 digit dari aplikasi autentikator"}</label>
      <input id="code" name="code" inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder={recovery ? "XXXX-XXXX-XXXX-XXXX" : "123456"} />
      <Feedback error={a.error} ok={a.ok} />
      <p className="row">
        <button type="submit" disabled={a.pending}>Verifikasi</button>
        <button type="button" className="secondary" onClick={() => { setRecovery(!recovery); setCode(""); a.setError(null); }}>{recovery ? "Pakai kode autentikator" : "Pakai kode pemulihan"}</button>
      </p>
    </form>
  );
}

type Setup = { secret: string; otpauthUri: string; qrDataUrl: string };
export function TotpSetupForm() {
  const router = useRouter();
  const a = useAction();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  if (codes)
    return (
      <>
        <Notice kind="warn"><strong>Simpan kode pemulihan ini sekarang.</strong> Setiap kode hanya berlaku sekali dan <u>tidak akan ditampilkan lagi</u>. Simpan di tempat aman (pengelola kata sandi), bukan di chat atau email.</Notice>
        <div className="codes" aria-label="Kode pemulihan">{codes.map((c) => <code key={c}>{c}</code>)}</div>
        <label className="check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Saya sudah menyimpan kode pemulihan</label>
        <p><button disabled={!saved} onClick={() => router.push("/")}>Selesai</button></p>
      </>
    );
  if (!setup)
    return (
      <>
        <p className="muted">Gunakan aplikasi autentikator (Google Authenticator, Microsoft Authenticator, Authy, 1Password, dll.).</p>
        <Feedback error={a.error} ok={a.ok} />
        <button disabled={a.pending} onClick={() => a.run<Setup>("POST", "/api/v1/auth/totp/setup", {}, { refresh: false, onOk: setSetup })}>Mulai pendaftaran 2FA</button>
      </>
    );
  return (
    <form onSubmit={(e) => { e.preventDefault(); void a.run<{ recoveryCodes: string[] }>("POST", "/api/v1/auth/totp/confirm", { code }, { refresh: false, onOk: (d) => setCodes(d.recoveryCodes) }); }}>
      <p>1. Pindai kode QR berikut dengan aplikasi autentikator:</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="qr"><img src={setup.qrDataUrl} alt="Kode QR untuk aplikasi autentikator" width={220} height={220} /></div>
      <p className="small muted">Tidak bisa memindai? Masukkan kunci ini manual: <code className="mono">{setup.secret}</code></p>
      <p>2. Masukkan kode 6 digit yang muncul untuk memastikan pendaftaran benar:</p>
      <input aria-label="Kode 6 digit" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
      <Feedback error={a.error} ok={a.ok} />
      <p><button type="submit" disabled={a.pending}>Aktifkan 2FA</button></p>
    </form>
  );
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const a = useAction();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) return a.setError("Kata sandi baru dan ulangannya tidak sama.");
    const r = await a.run("POST", "/api/v1/auth/password", { currentPassword: cur, newPassword: next }, { refresh: false });
    if (r.ok) router.push("/");
  };
  return (
    <form onSubmit={submit} aria-label="Ganti kata sandi">
      {forced && <Notice kind="info">Anda harus mengganti kata sandi sementara sebelum melanjutkan.</Notice>}
      <label htmlFor="cur">Kata sandi saat ini</label>
      <input id="cur" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
      <label htmlFor="new">Kata sandi baru (minimal 12 karakter)</label>
      <input id="new" type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => setNext(e.target.value)} />
      <label htmlFor="again">Ulangi kata sandi baru</label>
      <input id="again" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
      <Feedback error={a.error} ok={a.ok} />
      <p><button type="submit" disabled={a.pending}>Simpan kata sandi</button></p>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const a = useAction();
  return (
    <button className="secondary" disabled={a.pending} onClick={async () => { await a.run("POST", "/api/v1/auth/logout", {}, { refresh: false }); router.push("/login"); router.refresh(); }}>
      Keluar
    </button>
  );
}
