-- Migrasi kustom (maju saja): kontrol integritas yang tidak dapat diekspresikan oleh skema deklaratif.
-- Seluruh pengaman di bawah ditegakkan DI DATABASE agar tetap berlaku walau lapisan aplikasi salah/dilewati.

-- 1) Baris pengaturan organisasi (singleton) -------------------------------------------------
INSERT INTO org_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- 2) Audit log append-only (CCP 1.4) ---------------------------------------------------------
CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log bersifat append-only: % ditolak', TG_OP USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint

-- 3) Batas channel aktif aman terhadap permintaan bersamaan (CCP 1.6) -------------------------
-- Semua perubahan yang dapat menambah jumlah channel aktif diserialkan oleh satu advisory lock
-- (lepas otomatis saat transaksi selesai), lalu jumlahnya dihitung ulang dari data yang sudah commit.
CREATE FUNCTION enforce_channel_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lim integer;
  cnt integer;
BEGIN
  IF NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.archived_at IS NULL THEN
    RETURN NEW; -- sudah aktif sebelumnya: tidak menambah jumlah
  END IF;
  PERFORM pg_advisory_xact_lock(727001);
  SELECT max_channels INTO lim FROM org_settings WHERE id = 1;
  SELECT count(*) INTO cnt FROM channels WHERE archived_at IS NULL AND id <> NEW.id;
  IF cnt + 1 > lim THEN
    RAISE EXCEPTION 'Batas channel aktif (%) tercapai', lim USING ERRCODE = 'TE001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER channels_enforce_limit BEFORE INSERT OR UPDATE OF archived_at ON channels
  FOR EACH ROW EXECUTE FUNCTION enforce_channel_limit();
--> statement-breakpoint

-- Menurunkan batas di bawah jumlah channel aktif ditolak (dengan lock yang sama).
CREATE FUNCTION enforce_limit_not_below_active() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cnt integer;
BEGIN
  IF NEW.max_channels < OLD.max_channels THEN
    PERFORM pg_advisory_xact_lock(727001);
    SELECT count(*) INTO cnt FROM channels WHERE archived_at IS NULL;
    IF cnt > NEW.max_channels THEN
      RAISE EXCEPTION 'Batas (%) lebih kecil dari jumlah channel aktif (%)', NEW.max_channels, cnt USING ERRCODE = 'TE003';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER org_settings_limit_guard BEFORE UPDATE OF max_channels ON org_settings
  FOR EACH ROW EXECUTE FUNCTION enforce_limit_not_below_active();
--> statement-breakpoint

-- 4) Super Admin aktif terakhir tidak dapat dinonaktifkan/diturunkan/dihapus (CCP 1.2) --------
CREATE FUNCTION protect_last_super_admin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining integer;
BEGIN
  IF OLD.is_super_admin AND OLD.status = 'active'
     AND (TG_OP = 'DELETE' OR NOT NEW.is_super_admin OR NEW.status <> 'active') THEN
    PERFORM pg_advisory_xact_lock(727002);
    SELECT count(*) INTO remaining FROM users WHERE is_super_admin AND status = 'active' AND id <> OLD.id;
    IF remaining = 0 THEN
      RAISE EXCEPTION 'Super Admin aktif terakhir tidak boleh dinonaktifkan atau diturunkan haknya' USING ERRCODE = 'TE002';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_protect_last_super_admin BEFORE UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_last_super_admin();
