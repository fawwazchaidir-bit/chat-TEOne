-- Migrasi kustom Tahap 3 (maju saja): pembaruan tampilan dan integritas log status AI.

-- 1) `change_at` percakapan — dasar pembaruan tampilan (polling dengan jendela tumpang-tindih; ADR-0009).
--    Diperbarui pada SETIAP perubahan baris percakapan, dan oleh perubahan pesan/catatan yang berkaitan.
CREATE FUNCTION te_conversation_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.change_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER conversations_touch BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION te_conversation_touch();
--> statement-breakpoint
CREATE FUNCTION te_conversation_bump() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE conversations SET change_at = clock_timestamp() WHERE id = NEW.conversation_id;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER messages_bump_conversation AFTER INSERT OR UPDATE OF status, error_category, provider_message_id, body ON messages
  FOR EACH ROW EXECUTE FUNCTION te_conversation_bump();
--> statement-breakpoint
CREATE TRIGGER notes_bump_conversation AFTER INSERT ON conversation_notes
  FOR EACH ROW EXECUTE FUNCTION te_conversation_bump();
--> statement-breakpoint

-- 2) Log status AI append-only (kontrak inti #4: setiap perubahan teraudit). Berlaku bahkan untuk pemilik tabel.
CREATE FUNCTION te_ai_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'conversation_ai_events bersifat append-only: % ditolak', TG_OP USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER conversation_ai_events_no_update_delete BEFORE UPDATE OR DELETE ON conversation_ai_events
  FOR EACH ROW EXECUTE FUNCTION te_ai_events_immutable();
--> statement-breakpoint

-- 3) Catatan internal tidak boleh diubah isinya diam-diam (hanya dapat ditambah).
CREATE FUNCTION te_notes_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'conversation_notes bersifat append-only: % ditolak', TG_OP USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER conversation_notes_no_update_delete BEFORE UPDATE OR DELETE ON conversation_notes
  FOR EACH ROW EXECUTE FUNCTION te_notes_immutable();
