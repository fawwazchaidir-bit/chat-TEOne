import { CsrfProvider } from "@/components/client";
import { TotpVerifyForm } from "@/components/auth-forms";
import { requireStage } from "@/lib/page-auth";

export default async function TotpPage() {
  const s = await requireStage("totp_required");
  return (
    <CsrfProvider token={s.csrfToken}>
      <h1>Verifikasi 2 langkah</h1>
      <p className="muted">Masuk sebagai {s.user.email}. Selesaikan verifikasi untuk membuka akses.</p>
      <TotpVerifyForm />
    </CsrfProvider>
  );
}
