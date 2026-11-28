import { Badge } from "@/components/ui";
import type { WebhookCounterSnapshot, WebhookReason } from "@/modules/whatsapp-adapter";

const wib = (d: Date) => d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
const LABEL: Record<WebhookReason, string> = {
  ok: "Diterima & disimpan (200)",
  challenge_ok: "Verifikasi langganan berhasil (GET 200)",
  flag_off: "Ditolak: flag whatsapp_connector mati (404)",
  secret_missing: "Ditolak: App Secret belum dikonfigurasi (503)",
  too_large: "Ditolak: body terlalu besar (413)",
  signature_missing: "Ditolak: header tanda tangan tidak ada (401)",
  signature_invalid: "Ditolak: tanda tangan tidak cocok — cek App Secret (401)",
  not_json: "Ditolak: bukan JSON (400)",
  store_failed: "Gagal menyimpan event (500)",
  challenge_rejected: "Verifikasi langganan ditolak (GET 403)",
};

/** Ringkasan respons endpoint webhook 24 jam terakhir (G3-T01). Hanya hitungan per alasan — tanpa isi/nomor/ID. Khusus Super Admin. */
export function WebhookCounterCard({ snap }: { snap: WebhookCounterSnapshot }) {
  const rows = (Object.keys(LABEL) as WebhookReason[]).filter((r) => snap.byReason[r]);
  return (
    <div className="card">
      <h3>Respons endpoint webhook — {snap.windowHours} jam terakhir</h3>
      <p>
        {snap.rejected > 0 ? <Badge kind="bad">{snap.rejected} ditolak/gagal</Badge> : <Badge kind="na">0 ditolak/gagal</Badge>} <Badge kind="na">{snap.accepted} diterima</Badge>
        {snap.lastRejectedHour ? <> · penolakan terakhir pada jam mulai {wib(snap.lastRejectedHour)} WIB</> : null}
      </p>
      {rows.length === 0 ? <p className="muted">Belum ada request ke endpoint sejak penghitung dimulai.</p> : (
        <table><tbody>{rows.map((r) => <tr key={r}><td>{LABEL[r]}</td><td className="mono">{snap.byReason[r]}</td></tr>)}</tbody></table>
      )}
      <p className="muted">
        Penghitung di memori proses web sejak {wib(snap.since)} WIB — kembali ke nol saat aplikasi dimulai ulang dan tidak mencakup request yang tidak sampai ke aplikasi
        (mis. diblokir reverse proxy). Rincian per request ada di log aplikasi baris <code className="mono">[webhook]</code>.
      </p>
    </div>
  );
}
