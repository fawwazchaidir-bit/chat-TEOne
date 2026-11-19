import { redirect } from "next/navigation";
import { STAGE_PATH, currentSession } from "@/lib/page-auth";

export default async function Home() {
  const s = await currentSession();
  redirect(s ? STAGE_PATH[s.stage] : "/login");
}
