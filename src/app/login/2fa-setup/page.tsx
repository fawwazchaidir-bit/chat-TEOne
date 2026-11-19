import { redirect } from "next/navigation";
import { CsrfProvider } from "@/components/client";
import { TotpSetupForm } from "@/components/auth-forms";
import { STAGE_PATH, currentSession } from "@/lib/page-auth";

export default async function TotpSetupPage() {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.stage === "totp_required") redirect(STAGE_PATH.totp_required);
  if (s.user.totpEnabled) redirect("/dashboard");
  const wajib = s.stage === "totp_setup_required";
  return (
    <CsrfProvider token={s.csrfToken}>
      <h1>{wajib ? "Daftarkan 2FA (wajib)" : "Aktifkan 2FA"}</h1>
      <p className="muted">{wajib ? "Akun Anda wajib memakai verifikasi 2 langkah. Akses administratif ditolak sampai langkah ini selesai." : "Tambahkan lapisan keamanan ke akun Anda."}</p>
      <TotpSetupForm />
    </CsrfProvider>
  );
}
