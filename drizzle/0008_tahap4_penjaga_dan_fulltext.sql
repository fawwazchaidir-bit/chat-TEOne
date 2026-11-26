-- Migrasi kustom Tahap 4 (maju saja): penjaga integritas di DATABASE (bukan hanya aplikasi) + pencarian teks penuh. Kode galat TE010–TE014 (src/db/client.ts PG_ERR).

-- 1) Versi: dibuat sebagai draft; draft → terbit; terbit → diganti (tanpa perubahan isi); selain itu DITOLAK. Versi non-draft tidak dapat dihapus.
--    Argumen trigger = nama kolom induk (agent_id / program_card_id / source_id).
CREATE FUNCTION te_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION '%: versi baru harus berstatus draft (terbit lewat alur penerbitan)', TG_TABLE_NAME USING ERRCODE = 'TE010';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION '%: versi % sudah terbit/diganti dan tidak boleh dihapus', TG_TABLE_NAME, OLD.version_no USING ERRCODE = 'TE010';
    END IF;
    RETURN OLD;
  END IF;
  IF (to_jsonb(NEW) ->> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD) ->> TG_ARGV[0]) OR NEW.version_no <> OLD.version_no OR NEW.id <> OLD.id THEN
    RAISE EXCEPTION '%: induk/nomor versi tidak boleh diubah', TG_TABLE_NAME USING ERRCODE = 'TE010';
  END IF;
  IF OLD.status = 'draft' AND NEW.status IN ('draft', 'terbit') THEN
    RETURN NEW;
  END IF;
  -- `content_tsv` (kolom turunan knowledge) belum terhitung pada NEW di trigger BEFORE; ia murni fungsi `content_text` yang ikut dibandingkan.
  IF OLD.status = 'terbit' AND NEW.status = 'diganti' AND (to_jsonb(NEW) - 'status' - 'content_tsv') = (to_jsonb(OLD) - 'status' - 'content_tsv') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '%: versi % berstatus % tidak boleh diubah (hanya terbit → diganti tanpa perubahan isi)', TG_TABLE_NAME, OLD.version_no, OLD.status USING ERRCODE = 'TE010';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ai_agent_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_agent_versions
  FOR EACH ROW EXECUTE FUNCTION te_version_guard('agent_id');
--> statement-breakpoint
CREATE TRIGGER program_card_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON program_card_versions
  FOR EACH ROW EXECUTE FUNCTION te_version_guard('program_card_id');
--> statement-breakpoint
CREATE TRIGGER knowledge_source_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON knowledge_source_versions
  FOR EACH ROW EXECUTE FUNCTION te_version_guard('source_id');
--> statement-breakpoint

-- 2) Sumber yang dipilih sebuah versi agent hanya boleh berubah selama versi itu draft (versi terbit = sumbernya beku).
CREATE FUNCTION te_agent_sources_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE vid uuid; vst text;
BEGIN
  vid := CASE WHEN TG_OP = 'INSERT' THEN NEW.version_id ELSE OLD.version_id END;
  IF TG_OP = 'UPDATE' AND NEW.version_id <> OLD.version_id THEN
    RAISE EXCEPTION 'ai_agent_version_sources: pindah versi tidak diizinkan' USING ERRCODE = 'TE014';
  END IF;
  SELECT status INTO vst FROM ai_agent_versions WHERE id = vid;
  IF vst IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'ai_agent_version_sources: sumber hanya boleh diubah pada versi draft (status versi: %)', coalesce(vst, 'tidak ada') USING ERRCODE = 'TE014';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ai_agent_version_sources_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_agent_version_sources
  FOR EACH ROW EXECUTE FUNCTION te_agent_sources_guard();
--> statement-breakpoint

-- 3) Agent yang masih ditempatkan di channel tidak boleh dinonaktifkan atau dihapus (penempatan harus ditangani lebih dulu).
CREATE FUNCTION te_agent_in_use_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (OLD.status = 'aktif' AND NEW.status = 'nonaktif') THEN
    IF EXISTS (SELECT 1 FROM ai_channel_agents WHERE agent_id = OLD.id AND ended_at IS NULL) THEN
      RAISE EXCEPTION 'Agent masih ditempatkan pada channel; akhiri/ganti penempatannya lebih dulu' USING ERRCODE = 'TE011';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ai_agents_in_use_guard BEFORE UPDATE OF status OR DELETE ON ai_agents
  FOR EACH ROW EXECUTE FUNCTION te_agent_in_use_guard();
--> statement-breakpoint

-- 4) Penempatan: hanya agent AKTIF yang punya versi TERBIT, pada channel yang belum diarsipkan; baris adalah RIWAYAT (hanya boleh diakhiri sekali; tidak dihapus).
CREATE FUNCTION te_channel_agent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ch_archived timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'Penempatan baru harus aktif (ended_at kosong)' USING ERRCODE = 'TE012';
    END IF;
    PERFORM 1 FROM ai_agents WHERE id = NEW.agent_id AND status = 'aktif' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Agent tidak aktif atau tidak ada' USING ERRCODE = 'TE012';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ai_agent_versions WHERE agent_id = NEW.agent_id AND status = 'terbit') THEN
      RAISE EXCEPTION 'Agent belum memiliki versi terbit' USING ERRCODE = 'TE012';
    END IF;
    SELECT archived_at INTO ch_archived FROM channels WHERE id = NEW.channel_id;
    IF ch_archived IS NOT NULL THEN
      RAISE EXCEPTION 'Channel sudah diarsipkan' USING ERRCODE = 'TE012';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Riwayat penempatan agent tidak boleh dihapus' USING ERRCODE = 'TE012';
  END IF;
  IF OLD.ended_at IS NOT NULL OR NEW.channel_id <> OLD.channel_id OR NEW.agent_id <> OLD.agent_id
     OR NEW.assigned_at <> OLD.assigned_at OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by THEN
    RAISE EXCEPTION 'Riwayat penempatan agent tidak boleh diubah (hanya diakhiri sekali)' USING ERRCODE = 'TE012';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ai_channel_agents_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_channel_agents
  FOR EACH ROW EXECUTE FUNCTION te_channel_agent_guard();
--> statement-breakpoint

-- 5) Kartu Program / knowledge baru boleh berstatus `aktif` bila punya versi TERBIT (tidak ada "aktif" kosong).
--    Argumen: tabel versi, kolom induk.
CREATE FUNCTION te_active_needs_published() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.status = 'aktif' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1 AND status = ''terbit'')', TG_ARGV[0], TG_ARGV[1]) INTO ok USING NEW.id;
    IF NOT ok THEN
      RAISE EXCEPTION '%: status aktif membutuhkan versi terbit', TG_TABLE_NAME USING ERRCODE = 'TE013';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER program_cards_active_guard BEFORE INSERT OR UPDATE OF status ON program_cards
  FOR EACH ROW EXECUTE FUNCTION te_active_needs_published('program_card_versions', 'program_card_id');
--> statement-breakpoint
CREATE TRIGGER knowledge_sources_active_guard BEFORE INSERT OR UPDATE OF status ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION te_active_needs_published('knowledge_source_versions', 'source_id');
--> statement-breakpoint

-- 6) Pencarian teks penuh knowledge (ADR-0011: awal = PostgreSQL FTS config `indonesian`; vektor ditunda). Kolom hasil-turunan, tidak dipetakan ORM.
ALTER TABLE knowledge_source_versions ADD COLUMN content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('indonesian', coalesce(content_text, ''))) STORED;
--> statement-breakpoint
CREATE INDEX knowledge_source_versions_fts_idx ON knowledge_source_versions USING gin (content_tsv);
