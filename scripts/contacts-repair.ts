/**
 * Pemulihan identitas kontak lewat akses server (G2-A01) — hanya untuk operator dengan akses server + DATABASE_URL.
 *   npm run contacts:repair -- list-multi              daftar kontak dengan >1 identitas (kandidat pemeriksaan; TANPA nomor lengkap)
 *   npm run contacts:repair -- detach <identity-id>    pindahkan SATU identitas dari kontak yang salah ke kontak BARU (diaudit)
 * BATASAN JUJUR: pesan tidak menyimpan identitas pengirimnya, sehingga percakapan/pesan yang sudah ada tetap pada kontak asal dan
 * tidak dapat dipisah otomatis. Untuk data yang sudah tercampur, tinjau manual lalu hapus/arsipkan percakapan atas permintaan (D-18).
 * Belum ada penggabungan (merge) kontak otomatis — penggabungan adalah tindakan eksplisit yang belum dibangun.
 */
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { writeAudit } from "../src/modules/audit";
import { detachIdentity } from "../src/modules/contacts/service";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const db = getDb();
  if (cmd === "list-multi") {
    const rows = await db.execute(sql`
      select contact_id, count(*)::int n, string_agg(id::text || ' ' || identity_type || ' ••••' || right(identity_value, 4), ' | ' order by created_at) ids
      from contact_identities group by contact_id having count(*) > 1 order by n desc limit 200`);
    const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as { contact_id: string; n: number; ids: string }[];
    for (const r of list) console.log(`kontak ${r.contact_id} · ${r.n} identitas · ${r.ids}`);
    if (list.length === 0) console.log("Tidak ada kontak dengan lebih dari satu identitas.");
    return;
  }
  if (cmd === "detach" && arg) {
    const r = await db.transaction(async (tx) => {
      const x = await detachIdentity(tx, arg);
      await writeAudit(tx, { actorLabel: "cli:contacts-repair", action: "contact.identity_detached", objectType: "contact", objectId: x.oldContactId, metadata: { identityId: arg, newContactId: x.newContactId } });
      return x;
    });
    console.log(`Identitas dipindahkan: kontak lama ${r.oldContactId} → kontak baru ${r.newContactId}. Pesan yang ada tetap pada kontak lama (lihat batasan di berkas ini).`);
    return;
  }
  throw new Error("Pemakaian: contacts:repair -- list-multi | detach <identity-id>");
}
main().catch((e) => { console.error("Gagal:", (e as Error).message); process.exit(1); }).finally(closeDb);
