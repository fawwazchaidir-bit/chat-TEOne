-- Dijalankan oleh `teone_owner` setelah setiap migrasi (idempoten). Menjamin hak runtime minimum.
GRANT USAGE ON SCHEMA public TO teone_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO teone_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO teone_app;
-- Audit log: aplikasi hanya boleh menambah dan membaca. (Trigger di migrasi 0001 menolak UPDATE/DELETE/TRUNCATE
-- bahkan untuk pemilik tabel; pencabutan hak ini adalah lapis pertahanan pertama.)
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM teone_app;
-- Tahap 3: log status AI dan catatan internal hanya bertambah (trigger di migrasi 0005 menegakkannya juga untuk pemilik).
-- (Dibungkus agar berkas ini tetap dapat dijalankan pada skema yang lebih tua, mis. snapshot Tahap 1 pada uji migrasi.)
DO $$
BEGIN
  IF to_regclass('public.conversation_ai_events') IS NOT NULL THEN REVOKE UPDATE, DELETE, TRUNCATE ON conversation_ai_events FROM teone_app; END IF;
  IF to_regclass('public.conversation_notes') IS NOT NULL THEN REVOKE UPDATE, DELETE, TRUNCATE ON conversation_notes FROM teone_app; END IF;
END
$$;
-- Aplikasi tidak boleh menyentuh riwayat migrasi.
REVOKE ALL ON SCHEMA drizzle FROM teone_app;
