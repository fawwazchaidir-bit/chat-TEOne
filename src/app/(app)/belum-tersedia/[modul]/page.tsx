import { notFound, redirect } from "next/navigation";
import { NotAvailable, PageHeader } from "@/components/ui";
import { isFeatureEnabled } from "@/modules/feature-flags";

const MODUL: Record<string, { nama: string; stage: number; ket: string }> = {
  inbox: { nama: "Inbox", stage: 3, ket: "Percakapan multi-channel, routing, pengambilalihan dari AI." },
  "ai-agent": { nama: "AI Agent", stage: 4, ket: "Balasan AI berbasis Kartu Program, eskalasi, simulator." },
  "kartu-program": { nama: "Kartu Program & Knowledge", stage: 4, ket: "Sumber tunggal harga, jadwal, dan tautan program." },
  "label-pipeline": { nama: "Label & Pipeline", stage: 5, ket: "Label kata kunci dan pipeline Admisi/Kemitraan/Komplain." },
  "template-followup": { nama: "Template & Follow-up", stage: 6, ket: "Template WhatsApp dan follow-up FU-1/FU-2." },
  laporan: { nama: "Laporan", stage: 5, ket: "Laporan dasar mengikuti izin channel." },
};

export default async function Page({ params }: { params: Promise<{ modul: string }> }) {
  const slug = (await params).modul;
  const m = MODUL[slug];
  if (!m) notFound();
  if (slug === "inbox" && (await isFeatureEnabled("inbox"))) redirect("/inbox"); // jangan mengaku "belum dibuat" bila modulnya sudah menyala
  return (
    <>
      <PageHeader title={m.nama} sub={<NotAvailable stage={m.stage} />} />
      <div className="card"><p>{m.ket}</p><p className="muted">Modul ini <strong>belum dibuat</strong>. Fitur tahap berikutnya sengaja tidak dibangun sebelum tahap sebelumnya diterima.</p></div>
    </>
  );
}
