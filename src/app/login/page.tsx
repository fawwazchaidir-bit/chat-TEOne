import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { STAGE_PATH, currentSession } from "@/lib/page-auth";

export default async function LoginPage() {
  const s = await currentSession();
  if (s) redirect(STAGE_PATH[s.stage]);
  return (
    <>
      <h1>Masuk</h1>
      <p className="muted">Gunakan akun TE One Anda. Akun ini terpisah dari Internal Portal.</p>
      <LoginForm />
    </>
  );
}
