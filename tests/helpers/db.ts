import { Client } from "pg";
import { TEST_OWNER_URL } from "../test-env";

/** Mengosongkan data uji lewat koneksi pemilik. audit_log TIDAK dikosongkan (append-only, bahkan TRUNCATE ditolak trigger). */
export async function resetDb() {
  const c = new Client({ connectionString: TEST_OWNER_URL });
  await c.connect();
  try {
    await c.query(`TRUNCATE users, roles, user_roles, role_grants, user_grants, sessions, recovery_codes, login_attempts,
      teams, team_members, channels, team_channels, feature_flag_overrides, kill_switches,
      contacts, contact_identities, conversations, messages, message_status_events, lead_sources, media,
      channel_connections, inbound_events, test_recipients, domain_outbox, quick_replies, automation_jobs RESTART IDENTITY CASCADE`);
    await c.query("UPDATE org_settings SET max_channels = 5, timezone = 'Asia/Jakarta' WHERE id = 1");
  } finally {
    await c.end();
  }
}

/** Menjalankan SQL sebagai pemilik (untuk menyiapkan/memverifikasi kondisi yang tidak boleh dilakukan aplikasi). */
export async function ownerQuery(sql: string, params: unknown[] = []) {
  const c = new Client({ connectionString: TEST_OWNER_URL });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}
