import { redirect } from "next/navigation";
import { CsrfProvider } from "@/components/client";
import { ChangePasswordForm } from "@/components/auth-forms";
import { STAGE_PATH, currentSession } from "@/lib/page-auth";

export default async function ChangePasswordPage() {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.stage !== "password_change_required" && s.stage !== "full") redirect(STAGE_PATH[s.stage]);
  return (
    <CsrfProvider token={s.csrfToken}>
      <h1>Ganti kata sandi</h1>
      <ChangePasswordForm forced={s.stage === "password_change_required"} />
    </CsrfProvider>
  );
}
