-- Dijalankan oleh `teone_owner` setelah setiap migrasi (idempoten). Menjamin hak runtime minimum.
GRANT USAGE ON SCHEMA public TO teone_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO teone_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO teone_app;
-- Audit log: aplikasi hanya boleh menambah dan membaca. (Trigger di migrasi 0001 menolak UPDATE/DELETE/TRUNCATE
-- bahkan untuk pemilik tabel; pencabutan hak ini adalah lapis pertahanan pertama.)
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM teone_app;
-- Aplikasi tidak boleh menyentuh riwayat migrasi.
REVOKE ALL ON SCHEMA drizzle FROM teone_app;
