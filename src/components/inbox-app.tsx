"use client";
/**
 * Inbox tim (Tahap 3). Semua keputusan izin ada di SERVER; tombol di sini hanya mencerminkan `can` dari server (bukan penjaga).
 * Pembaruan tampilan = polling (ADR-0009): setiap putaran memanggil /inbox/changes (izin diperiksa server tiap panggilan), jeda otomatis
 * saat tab tersembunyi, backoff bila galat, pulih penuh (resync) setelah koneksi kembali. Isi pesan/nama berkas dirender sebagai TEKS
 * (React meng-escape) — tidak ada innerHTML. Penanda jujur: AI belum terhubung (Tahap 4); hasil kirim "belum pasti" tidak disembunyikan.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Badge } from "./ui";
import { Notice, describeError, useApi, useCsrf } from "./client";

type Badged = "ok" | "warn" | "bad" | "sample" | "na" | undefined;
export type Item = {
  id: string; channelId: string; channelName: string; contactName: string | null; identity: string | null; lastMessageAt: string | null;
  preview: { text: string | null; type: string; direction: string; source: string; status: string | null } | null;
  unread: number; aiStatus: "aktif" | "off"; aiOffReason: string | null; aiLabel: string; aiVersion: number;
  teamId: string | null; teamName: string | null; assigneeId: string | null; assigneeName: string | null; assignVersion: number;
  escalated: boolean; strayLead: boolean; reviewFlag: string | null; windowOpen: boolean; changeAt: string;
};
type Nav = {
  totals: { all: number; mine: number; unassigned: number; unread: number; escalated: number; strayLead: number; review: number };
  channels: { id: string; name: string; count: number; unread: number; connection: { status: string; mode: string | null } }[];
  teams: { id: string; name: string; count: number }[];
  killSwitches: { scopeType: string; scopeRef: string; reason: string | null; engagedAt: string | null }[];
};
type Msg = { id: string; direction: string; source: string; type: string; rawType: string | null; body: string | null; status: string | null; errorCategory: string | null; isHistory: boolean; at: string; mediaId: string | null; mediaStatus: string | null };
type Note = { id: string; body: string; authorId: string; at: string };
type Thread = { messages: Msg[]; notes: Note[]; hasMore: boolean; before: string | null };
type Detail = {
  conversation: Item;
  contact: { id: string; publicRef: string; displayName: string | null; identities: { type: string; value: string }[] };
  leadSources: { sourceType: string | null; sourceId: string | null; sourceUrl: string | null; headline: string | null; at: string | null }[];
  otherChannels: Item[];
  ai: { status: "aktif" | "off"; reason: string | null; version: number; boundaryAt: string | null; label: string; connected: boolean };
  window: { open: boolean; reason: string; closesAt: string | null; message: string };
  jobs: { id: string; kind: string; status: string; reason: string | null; aiVersion: number; at: string | null }[];
  aiEvents: { from: string; to: string; reason: string | null; version: number; actor: string | null; at: string | null }[];
  activity: { action: string; actor: string | null; result: string; at: string | null }[];
  routing: { teams: { id: string; name: string; members: { id: string; name: string }[] }[]; allTeams: { id: string; name: string }[] };
  can: { reply: boolean; note: boolean; ai: boolean; assign: boolean; transfer: boolean };
};
type QuickReply = { id: string; title: string; text: string };
type Scope = { kind: "all" } | { kind: "mine" } | { kind: "none" } | { kind: "channel"; id: string } | { kind: "team"; id: string };
type Filters = { scope: Scope; unread: boolean; ai: "" | "aktif" | "off"; escalated: boolean; stray: boolean; review: boolean; q: string };

const SOURCE: Record<string, [string, Badged]> = { pelanggan: ["Pelanggan", undefined], te_one: ["TE One", "ok"], whatsapp_business_app: ["WhatsApp Business App", "warn"], history: ["History", "na"], ai: ["AI (simulasi)", "sample"] };
const STATUS: Record<string, [string, Badged]> = {
  diproses: ["Sedang dikirim / belum pasti", "warn"], diterima_api: ["Diterima Meta", undefined], terkirim: ["Terkirim", undefined], diterima: ["Diterima", "ok"], dibaca: ["Dibaca", "ok"], gagal: ["Gagal", "bad"], belum_pasti: ["BELUM PASTI", "warn"],
};
const JOB_STATUS: Record<string, string> = {
  menunggu: "Menunggu giliran (dapat dibatalkan)", diproses: "Sedang diproses", dikirim: "Sedang dikirim / belum pasti — sudah ke Meta, TIDAK dapat dibatalkan", selesai: "Selesai terkirim",
  dibatalkan: "Dibatalkan (tidak ada pesan terkirim)", gagal: "Gagal", belum_pasti: "BELUM PASTI — hasil kirim tidak dapat dipastikan", ditahan: "Ditahan",
};
const KS_LABEL: Record<string, string> = { global: "GLOBAL", channel: "Channel", feature: "Fitur", chat: "Chat" };
const POLL_MS = 4000;
const OVERLAP_MS = 2000;

export const timeLabel = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function listQuery(f: Filters, o: { limit: number; cursor?: string | null }) {
  const p = new URLSearchParams();
  if (f.scope.kind === "mine") p.set("assignee", "me");
  if (f.scope.kind === "none") p.set("assignee", "none");
  if (f.scope.kind === "channel") p.set("channelId", f.scope.id);
  if (f.scope.kind === "team") p.set("teamId", f.scope.id);
  if (f.unread) p.set("unread", "1");
  if (f.ai) p.set("aiStatus", f.ai);
  if (f.escalated) p.set("escalated", "1");
  if (f.stray) p.set("strayLead", "1");
  if (f.review) p.set("review", "1");
  if (f.q.trim()) p.set("q", f.q.trim());
  p.set("limit", String(o.limit));
  if (o.cursor) p.set("cursor", o.cursor);
  return p.toString();
}

export function InboxApp() {
  const api = useApi();
  const [nav, setNav] = useState<Nav | null>(null);
  const [filters, setFilters] = useState<Filters>({ scope: { kind: "all" }, unread: false, ai: "", escalated: false, stray: false, review: false, q: "" });
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<"ok" | "putus">("ok");
  const [loading, setLoading] = useState(true);

  const filtersRef = useRef(filters); filtersRef.current = filters;
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const itemsLenRef = useRef(0); itemsLenRef.current = items.length;
  const sinceRef = useRef<string | null>(null);
  const failRef = useRef(0);
  const reqSeq = useRef(0);

  const loadNav = useCallback(async () => { const r = await api<Nav>("GET", "/api/v1/inbox/nav"); if (r.ok) setNav(r.data); else if (r.status !== 0) setError(describeError(r.error)); }, [api]);

  /** Memuat ulang daftar sebanyak yang sudah tampil (maks. 100) — hasilnya MENGGANTI daftar (tanpa duplikasi; filter selalu benar). */
  const loadList = useCallback(async (keepExtent = false) => {
    const seq = ++reqSeq.current;
    const limit = keepExtent ? Math.min(Math.max(itemsLenRef.current, 30), 100) : 30;
    const r = await api<{ items: Item[]; total: number; nextCursor: string | null }>("GET", `/api/v1/inbox/conversations?${listQuery(filtersRef.current, { limit })}`);
    if (seq !== reqSeq.current) return; // jawaban usang dari filter sebelumnya diabaikan
    if (r.ok) { setItems(dedupe(r.data.items)); setTotal(r.data.total); setCursor(r.data.nextCursor); setError(null); } else if (r.status !== 0) setError(describeError(r.error));
    setLoading(false);
  }, [api]);

  const loadMore = async () => {
    if (!cursor) return;
    const r = await api<{ items: Item[]; total: number; nextCursor: string | null }>("GET", `/api/v1/inbox/conversations?${listQuery(filters, { limit: 30, cursor })}`);
    if (r.ok) { setItems((cur) => dedupe([...cur, ...r.data.items])); setCursor(r.data.nextCursor); setTotal(r.data.total); }
  };

  const threadRef = useRef<HTMLElement>(null);
  const loadConversation = useCallback(async (id: string) => {
    const [d, t] = await Promise.all([api<Detail>("GET", `/api/v1/conversations/${id}`), api<Thread>("GET", `/api/v1/conversations/${id}/messages?limit=100`)]);
    if (selectedRef.current !== id) return;
    if (d.ok && t.ok) { setDetail(d.data); setThread(t.data); } else { setDetail(null); setThread(null); setError(!d.ok ? describeError(d.error) : !t.ok ? describeError(t.error) : null); }
  }, [api]);

  // Layar sempit (kolom bertumpuk): pilih percakapan → gulir ke isi percakapan.
  useEffect(() => { if (selected && detail && window.matchMedia("(max-width: 860px)").matches) threadRef.current?.scrollIntoView({ block: "start" }); }, [selected, detail?.conversation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = useCallback(async (id: string) => { await api("POST", `/api/v1/conversations/${id}/read`, {}); }, [api]);

  // muat ulang saat filter berubah (dengan debounce untuk pencarian)
  useEffect(() => { setLoading(true); const t = setTimeout(() => void loadList(false), filters.q ? 300 : 0); return () => clearTimeout(t); }, [filters, loadList]);
  useEffect(() => { void loadNav(); }, [loadNav]);
  useEffect(() => { if (selected) { setDetail(null); setThread(null); void loadConversation(selected); void markRead(selected).then(() => { void loadList(true); void loadNav(); }); } else { setDetail(null); setThread(null); } }, [selected, loadConversation, markRead, loadList, loadNav]);

  // ── Polling (ADR-0009) ──
  useEffect(() => {
    let stop = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop) return;
      if (document.hidden) { timer = setTimeout(tick, POLL_MS); return; }
      const since = sinceRef.current ? new Date(new Date(sinceRef.current).getTime() - OVERLAP_MS).toISOString() : null;
      const r = await api<{ serverTime: string; items: Item[]; truncated: boolean; resync: boolean; killSwitches: Nav["killSwitches"] }>("GET", `/api/v1/inbox/changes${since ? `?since=${encodeURIComponent(since)}` : ""}`);
      if (stop) return;
      if (!r.ok) {
        failRef.current++; setLive("putus");
        if (r.status === 401) { window.location.href = "/login"; return; }
        timer = setTimeout(tick, Math.min(30000, POLL_MS * 2 ** Math.min(failRef.current, 3)));
        return;
      }
      const recovered = failRef.current > 0; failRef.current = 0; setLive("ok");
      const first = sinceRef.current === null; sinceRef.current = r.data.serverTime;
      // Kill switch dibawa oleh umpan perubahan: spanduk muncul/hilang dalam satu putaran polling, tidak bergantung pada ada-tidaknya pesan baru.
      const ks = r.data.killSwitches;
      if (ks) setNav((n) => (n && JSON.stringify(n.killSwitches) !== JSON.stringify(ks) ? { ...n, killSwitches: ks } : n));
      if (r.data.resync || r.data.truncated || recovered) { void loadList(true); void loadNav(); if (selectedRef.current) void loadConversation(selectedRef.current); }
      else if (r.data.items.length > 0) {
        void loadList(true); void loadNav();
        const sel = selectedRef.current;
        if (sel && r.data.items.some((i) => i.id === sel)) { void loadConversation(sel); void markRead(sel); }
      }
      void first;
      timer = setTimeout(tick, POLL_MS);
    };
    const onVisible = () => { if (!document.hidden) { if (timer) clearTimeout(timer); sinceRef.current = null; void tick(); } };
    const onOnline = () => { if (timer) clearTimeout(timer); sinceRef.current = null; void tick(); };
    void tick();
    document.addEventListener("visibilitychange", onVisible); window.addEventListener("online", onOnline);
    return () => { stop = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline); };
  }, [api, loadList, loadNav, loadConversation, markRead]);

  const refreshAll = useCallback(() => { void loadList(true); void loadNav(); if (selectedRef.current) void loadConversation(selectedRef.current); }, [loadList, loadNav, loadConversation]);

  return (
    <div className="inbox-root">
      {nav && nav.killSwitches.length > 0 && <KillBanner ks={nav.killSwitches} />}
      {live === "putus" && <Notice kind="warn">Koneksi pembaruan terputus — mencoba lagi otomatis. Data yang tampil mungkin belum terbaru.</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="inbox-grid">
        <NavPane nav={nav} filters={filters} setFilters={setFilters} />
        <ListPane items={items} total={total} loading={loading} hasMore={!!cursor} onMore={loadMore} selected={selected} onSelect={setSelected} filters={filters} setFilters={setFilters} />
        <section className="inbox-thread card" aria-label="Isi percakapan" ref={threadRef}>
          {!selected && <p className="muted">Pilih percakapan di sebelah kiri.</p>}
          {selected && !detail && <p className="muted">Memuat percakapan…</p>}
          {selected && detail && thread && <ThreadPane detail={detail} thread={thread} onChanged={refreshAll} />}
        </section>
        {selected && detail && <InfoPane detail={detail} onChanged={refreshAll} onOpen={setSelected} />}
      </div>
    </div>
  );
}

function dedupe(list: Item[]): Item[] { const m = new Map<string, Item>(); for (const i of list) m.set(i.id, i); return [...m.values()]; }

function KillBanner({ ks }: { ks: Nav["killSwitches"] }) {
  return (
    <div className="notice error" role="alert" aria-label="Kill switch aktif">
      <strong>Otomatisasi DIHENTIKAN oleh kill switch.</strong> Tidak ada balasan otomatis yang dikirim pada cakupan berikut; kill switch tidak pernah menyala kembali sendiri.
      <ul style={{ margin: ".3rem 0 0 1.2rem" }}>{ks.map((k) => <li key={`${k.scopeType}:${k.scopeRef}`}>{KS_LABEL[k.scopeType] ?? k.scopeType}{k.scopeRef ? ` · ${k.scopeRef.length > 24 ? k.scopeRef.slice(0, 8) + "…" : k.scopeRef}` : ""}{k.reason ? ` — ${k.reason}` : ""}</li>)}</ul>
    </div>
  );
}

function connBadge(c: Nav["channels"][number]["connection"]) {
  if (c.status === "terverifikasi") return c.mode === "nyata" ? <Badge kind="ok">Terverifikasi (nyata)</Badge> : <Badge kind="sample">Terverifikasi — SIMULASI</Badge>;
  if (c.status === "gagal") return <Badge kind="bad">Pemeriksaan gagal</Badge>;
  if (c.status === "belum_dikonfigurasi") return <Badge kind="na">Belum dikonfigurasi</Badge>;
  return <Badge kind="warn">Belum diperiksa</Badge>;
}

function NavPane({ nav, filters, setFilters }: { nav: Nav | null; filters: Filters; setFilters: (f: Filters) => void }) {
  const set = (scope: Scope) => setFilters({ ...filters, scope });
  const is = (s: Scope) => JSON.stringify(filters.scope) === JSON.stringify(s);
  const Btn = ({ s, label, n, unread }: { s: Scope; label: string; n?: number; unread?: number }) => (
    <button type="button" className={`navbtn${is(s) ? " active" : ""}`} aria-pressed={is(s)} onClick={() => set(s)}>
      <span>{label}</span><span>{unread ? <Badge kind="warn">{unread}</Badge> : null} <span className="muted small">{n ?? ""}</span></span>
    </button>
  );
  const paused = new Set((nav?.killSwitches ?? []).filter((k) => k.scopeType === "channel").map((k) => k.scopeRef));
  return (
    <nav className="inbox-nav card" aria-label="Navigasi inbox">
      <Btn s={{ kind: "all" }} label="Semua percakapan" n={nav?.totals.all} unread={nav?.totals.unread} />
      <Btn s={{ kind: "mine" }} label="Ditugaskan ke saya" n={nav?.totals.mine} />
      <Btn s={{ kind: "none" }} label="Belum ditugaskan" n={nav?.totals.unassigned} />
      <div className="sec">Channel</div>
      {nav?.channels.map((c) => (
        <div key={c.id}>
          <Btn s={{ kind: "channel", id: c.id }} label={c.name} n={c.count} unread={c.unread} />
          <div className="small" style={{ margin: "0 0 .35rem .6rem" }}>{connBadge(c.connection)}{paused.has(c.id) && <> <Badge kind="bad">Otomatisasi dijeda</Badge></>}</div>
        </div>
      ))}
      {nav && nav.channels.length === 0 && <p className="small muted">Belum ada percakapan pada channel yang dapat Anda akses.</p>}
      <div className="sec">Tim / antrian</div>
      {nav?.teams.map((t) => <Btn key={t.id} s={{ kind: "team", id: t.id }} label={t.name} n={t.count} />)}
      {nav && nav.teams.length === 0 && <p className="small muted">Belum ada percakapan yang masuk antrian tim.</p>}
    </nav>
  );
}

function ListPane({ items, total, loading, hasMore, onMore, selected, onSelect, filters, setFilters }: { items: Item[]; total: number; loading: boolean; hasMore: boolean; onMore: () => void; selected: string | null; onSelect: (id: string) => void; filters: Filters; setFilters: (f: Filters) => void }) {
  return (
    <section className="inbox-list card" aria-label="Daftar percakapan">
      <label className="sr" htmlFor="ib-q">Cari nama atau nomor</label>
      <input id="ib-q" type="search" placeholder="Cari nama atau nomor…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
      <div className="chips" role="group" aria-label="Filter">
        <Chip on={filters.unread} onClick={() => setFilters({ ...filters, unread: !filters.unread })}>Belum dibaca</Chip>
        <Chip on={filters.ai === "aktif"} onClick={() => setFilters({ ...filters, ai: filters.ai === "aktif" ? "" : "aktif" })}>AI Aktif</Chip>
        <Chip on={filters.ai === "off"} onClick={() => setFilters({ ...filters, ai: filters.ai === "off" ? "" : "off" })}>AI Off</Chip>
        <Chip on={filters.escalated} onClick={() => setFilters({ ...filters, escalated: !filters.escalated })}>Eskalasi</Chip>
        <Chip on={filters.stray} onClick={() => setFilters({ ...filters, stray: !filters.stray })}>Lead nyasar</Chip>
        <Chip on={filters.review} onClick={() => setFilters({ ...filters, review: !filters.review })}>Perlu ditinjau</Chip>
      </div>
      <div className="small muted" style={{ margin: ".3rem 0" }}>{loading ? "Memuat…" : `${total} percakapan`}</div>
      <ul className="convlist">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" className={`conv${selected === i.id ? " active" : ""}${i.unread ? " unread" : ""}`} onClick={() => onSelect(i.id)} aria-current={selected === i.id}>
              <div className="top"><strong>{i.contactName ?? "Tanpa nama"}</strong><span className="small muted">{timeLabel(i.lastMessageAt)}</span></div>
              <div className="small muted">{i.identity ?? "—"} · {i.channelName}</div>
              <div className="prev">{i.preview ? <>{i.preview.direction === "keluar" ? "Anda: " : ""}{i.preview.text ?? `[${i.preview.type}]`}</> : <span className="muted">Belum ada pesan</span>}</div>
              <div className="meta">
                {i.unread > 0 && <Badge kind="warn">{i.unread} baru</Badge>}
                <Badge kind={i.aiStatus === "aktif" ? "sample" : "na"}>{i.aiStatus === "aktif" ? "AI Aktif" : "AI Off"}</Badge>
                {i.escalated && <Badge kind="bad">Eskalasi</Badge>}
                {i.strayLead && <Badge kind="warn">Lead nyasar</Badge>}
                {i.reviewFlag && <Badge kind="warn">Perlu ditinjau</Badge>}
                {i.teamName && <Badge>{i.teamName}</Badge>}
                {i.assigneeName && <span className="small muted">PIC: {i.assigneeName}</span>}
              </div>
            </button>
          </li>
        ))}
        {!loading && items.length === 0 && <li className="muted small" style={{ padding: ".6rem" }}>Tidak ada percakapan yang cocok.</li>}
      </ul>
      {hasMore && <button type="button" className="secondary" onClick={onMore} style={{ width: "100%", marginTop: ".5rem" }}>Muat lebih banyak</button>}
    </section>
  );
}
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) => <button type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>{children}</button>;

function MessageBubble({ m }: { m: Msg }) {
  const [src, srcKind] = SOURCE[m.isHistory ? "history" : m.source] ?? [m.source, undefined];
  const [st, stKind] = m.status ? (STATUS[m.status] ?? [m.status, undefined]) : [null, undefined];
  const out = m.direction === "keluar";
  const mediaOk = m.mediaId && m.mediaStatus === "tersimpan";
  return (
    <div className={`msg ${out ? "out" : "in"}`}>
      <div className="small muted" style={{ marginBottom: 2 }}>
        <Badge kind={srcKind}>{src}</Badge> {timeLabel(m.at)}
        {out && st && <> · <Badge kind={stKind}>{st}</Badge></>}
        {m.status === "gagal" && m.errorCategory && <> <span className="small">({m.errorCategory})</span></>}
      </div>
      {/* Media PRIVAT yang diautentikasi per permintaan (cookie sesi + izin percakapan): bukan aset publik, jadi optimasi next/image tidak berlaku. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m.type === "image" && mediaOk && <a href={`/api/v1/media/${m.mediaId}`} target="_blank" rel="noopener noreferrer"><img className="media" src={`/api/v1/media/${m.mediaId}`} alt="Gambar dalam percakapan" /></a>}
      {m.type === "document" && mediaOk && <a href={`/api/v1/media/${m.mediaId}`} target="_blank" rel="noopener noreferrer">Buka dokumen</a>}
      {(m.type === "image" || m.type === "document" || m.type === "audio" || m.type === "video") && !mediaOk && <div className="small"><Badge kind="warn">Media tidak tersedia{m.mediaStatus ? ` (${m.mediaStatus})` : ""}</Badge></div>}
      {m.type === "unsupported" && <div className="small"><Badge kind="warn">Jenis pesan belum didukung{m.rawType ? ` (${m.rawType})` : ""}</Badge></div>}
      {m.body && <div className="body">{m.body}</div>}
    </div>
  );
}

function ThreadPane({ detail, thread, onChanged }: { detail: Detail; thread: Thread; onChanged: () => void }) {
  const c = detail.conversation;
  const merged = useMemo(() => {
    const all = [...thread.messages.map((m) => ({ t: m.at, kind: "m" as const, m })), ...thread.notes.map((n) => ({ t: n.at, kind: "n" as const, n }))];
    return all.sort((a, b) => a.t.localeCompare(b.t));
  }, [thread]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastId = merged.at(-1)?.kind === "m" ? (merged.at(-1) as { m: Msg }).m.id : (merged.at(-1) as { n: Note } | undefined)?.n.id;
  // Gulir KONTAINER pesan ke yang terbaru (bukan scrollIntoView, yang dapat menggeser seluruh halaman).
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [lastId, c.id]);
  return (
    <>
      <header className="thread-head">
        <div><h2 style={{ margin: 0 }}>{c.contactName ?? "Tanpa nama"}</h2><div className="small muted">{c.identity ?? "—"} · {c.channelName}</div></div>
        <div className="small">{detail.window.open ? <Badge kind="ok">Jendela layanan terbuka{detail.window.closesAt ? ` s.d. ${timeLabel(detail.window.closesAt)}` : ""}</Badge> : <Badge kind="bad">Jendela layanan tertutup</Badge>}</div>
      </header>
      {c.reviewFlag && <Notice kind="warn">Urutan/waktu pesan tidak dapat dipastikan sehingga otomatisasi TIDAK memprosesnya. Tinjau lalu tandai selesai. <ReviewButton id={c.id} onDone={onChanged} /></Notice>}
      <div className="thread-body" role="log" aria-live="polite" aria-label="Pesan" ref={bodyRef}>
        {thread.hasMore && <p className="small muted">Menampilkan {thread.messages.length} pesan terbaru.</p>}
        {merged.length === 0 && <p className="muted">Belum ada pesan.</p>}
        {merged.map((x) => x.kind === "m" ? <MessageBubble key={x.m.id} m={x.m} /> : (
          <div key={x.n.id} className="msg note"><div className="small"><Badge kind="warn">Catatan internal — tidak dikirim ke pelanggan</Badge> {timeLabel(x.n.at)}</div><div className="body">{x.n.body}</div></div>
        ))}
      </div>
      <Composer detail={detail} onSent={onChanged} />
    </>
  );
}

function ReviewButton({ id, onDone }: { id: string; onDone: () => void }) {
  const api = useApi(); const [busy, setBusy] = useState(false);
  return <button type="button" className="secondary" disabled={busy} onClick={async () => { setBusy(true); await api("POST", `/api/v1/conversations/${id}/review`, {}); setBusy(false); onDone(); }}>Tandai sudah ditinjau</button>;
}

function Composer({ detail, onSent }: { detail: Detail; onSent: () => void }) {
  const csrf = useCsrf(); const api = useApi();
  const c = detail.conversation;
  const [mode, setMode] = useState<"balas" | "catatan">("balas");
  const [text, setText] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"text" | "image" | "document">("text");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickReply[]>([]);
  const keyRef = useRef(crypto.randomUUID()); // kunci idempotensi: tetap sama sampai pengiriman BERHASIL (klik ganda / ulang jaringan aman)
  useEffect(() => { setText(""); setFile(null); setKind("text"); setErr(null); setInfo(null); keyRef.current = crypto.randomUUID(); }, [c.id]);
  useEffect(() => { if (!detail.can.reply) { setQuick([]); return; } void api<{ items: QuickReply[] }>("GET", `/api/v1/conversations/${c.id}/quick-replies`).then((r) => setQuick(r.ok ? r.data.items : [])); }, [api, c.id, detail.can.reply]);

  if (!detail.can.reply && !detail.can.note) return <p className="small muted composer-note">Anda hanya dapat melihat percakapan ini.</p>;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null); setInfo(null);
    try {
      if (mode === "catatan") {
        const r = await api("POST", `/api/v1/conversations/${c.id}/notes`, { body: text });
        if (r.ok) { setText(""); setInfo("Catatan internal tersimpan (tidak dikirim ke pelanggan)."); onSent(); } else setErr(describeError(r.error));
        return;
      }
      const f = new FormData();
      f.set("kind", kind); f.set("idempotencyKey", keyRef.current);
      if (kind === "text") f.set("text", text); else { if (text.trim()) f.set("caption", text); if (file) f.set("file", file); }
      const res = await fetch(`/api/v1/conversations/${c.id}/reply`, { method: "POST", credentials: "same-origin", headers: csrf ? { "x-csrf-token": csrf } : {}, body: f });
      const j = await res.json().catch(() => null) as { status?: string; error?: { code: string; message: string }; aiStatus?: string } | null;
      if (res.ok && j) {
        keyRef.current = crypto.randomUUID(); setText(""); setFile(null); setKind("text");
        setInfo(j.status === "diterima_api" ? "Pesan diterima Meta. AI dimatikan untuk percakapan ini." : j.status === "belum_pasti" ? "Hasil pengiriman BELUM PASTI — periksa statusnya di percakapan; jangan kirim ulang tanpa memeriksa." : "Pengiriman GAGAL. AI tetap dimatikan. Lihat alasannya pada pesan.");
        onSent();
      } else setErr(j?.error?.message ?? "Gagal mengirim.");
    } catch { setErr("Tidak dapat menghubungi server. Tombol kirim aman diulang — kunci idempotensi mencegah pesan ganda."); } finally { setBusy(false); }
  };

  const blockedReason = mode === "balas" && !detail.window.open ? detail.window.message : null;
  return (
    <form className="composer" onSubmit={send} aria-label="Komposer">
      <div className="tabs" role="tablist">
        {detail.can.reply && <button type="button" role="tab" aria-selected={mode === "balas"} className={mode === "balas" ? "tab on" : "tab"} onClick={() => setMode("balas")}>Balas pelanggan</button>}
        {detail.can.note && <button type="button" role="tab" aria-selected={mode === "catatan"} className={mode === "catatan" ? "tab on" : "tab"} onClick={() => setMode("catatan")}>Catatan internal</button>}
      </div>
      {blockedReason && <Notice kind="warn">{blockedReason}</Notice>}
      {mode === "catatan" && <p className="small muted" style={{ margin: ".2rem 0" }}>Catatan hanya terlihat oleh tim dan <strong>tidak pernah dikirim</strong> ke pelanggan.</p>}
      {mode === "balas" && (
        <div className="row" style={{ alignItems: "center" }}>
          <div><label htmlFor="cp-kind" className="sr">Jenis</label><select id="cp-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="text">Teks</option><option value="image">Gambar</option><option value="document">PDF / dokumen</option></select></div>
          {quick.length > 0 && <div><label htmlFor="cp-qr" className="sr">Balasan cepat</label><select id="cp-qr" value="" onChange={(e) => { const q = quick.find((x) => x.id === e.target.value); if (q) { setKind("text"); setText(q.text); } }}><option value="">Balasan cepat…</option>{quick.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}</select></div>}
          {kind !== "text" && <div><label htmlFor="cp-file" className="sr">Berkas</label><input id="cp-file" type="file" accept={kind === "image" ? "image/jpeg,image/png,image/webp" : "application/pdf"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>}
        </div>
      )}
      <label htmlFor="cp-text" className="sr">{mode === "catatan" ? "Isi catatan" : kind === "text" ? "Isi balasan" : "Keterangan (opsional)"}</label>
      <textarea id="cp-text" rows={3} value={text} maxLength={mode === "catatan" ? 2000 : 4096} onChange={(e) => setText(e.target.value)} placeholder={mode === "catatan" ? "Tulis catatan internal…" : kind === "text" ? "Tulis balasan…" : "Keterangan (opsional)"} />
      {err && <Notice kind="error">{err}</Notice>}
      {info && <Notice kind="info">{info}</Notice>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
        <span className="small muted">{mode === "balas" ? "Mengirim balasan mematikan AI pada percakapan ini (tetap Off walau pengiriman gagal)." : ""}</span>
        <button type="submit" disabled={busy || !!blockedReason || (mode === "catatan" ? !text.trim() : kind === "text" ? !text.trim() : !file)}>{busy ? "Mengirim…" : mode === "catatan" ? "Simpan catatan" : "Kirim"}</button>
      </div>
    </form>
  );
}

function InfoPane({ detail, onChanged, onOpen }: { detail: Detail; onChanged: () => void; onOpen: (id: string) => void }) {
  const api = useApi(); const c = detail.conversation;
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState<null | "aktifkan">(null);
  const [teamId, setTeamId] = useState(c.teamId ?? ""); const [assigneeId, setAssigneeId] = useState(c.assigneeId ?? "");
  const [toTeam, setToTeam] = useState(""); const [note, setNote] = useState(""); const [stray, setStray] = useState(true);
  useEffect(() => { setTeamId(c.teamId ?? ""); setAssigneeId(c.assigneeId ?? ""); setErr(null); setConfirm(null); }, [c.id, c.teamId, c.assigneeId, c.assignVersion, c.aiVersion]);
  const run = async (method: string, path: string, body: unknown) => { setBusy(true); setErr(null); const r = await api(method, path, body); setBusy(false); if (!r.ok) setErr(describeError(r.error)); onChanged(); return r; };
  const members = detail.routing.teams.find((t) => t.id === teamId)?.members ?? [];
  const aiAct = (action: string) => run("POST", `/api/v1/conversations/${c.id}/ai`, { action, expectedVersion: detail.ai.version });

  return (
    <aside className="inbox-info card" aria-label="Informasi percakapan">
      <h3>Status AI</h3>
      <p style={{ margin: ".2rem 0" }}><Badge kind={detail.ai.status === "aktif" ? "sample" : "na"}>{detail.ai.label}</Badge> <span className="small muted">v{detail.ai.version}</span></p>
      {detail.ai.status === "aktif" && !detail.ai.connected && <p className="small muted" style={{ margin: ".2rem 0" }}>AI sungguhan belum tersedia (Tahap 4). Pada tahap ini hanya <strong>simulasi</strong> untuk menguji pengambilalihan dan kill switch.</p>}
      {detail.ai.boundaryAt && <p className="small muted" style={{ margin: ".2rem 0" }}>Batas aktivasi ulang: {timeLabel(detail.ai.boundaryAt)} — hanya pesan pelanggan SETELAH batas yang layak diproses.</p>}
      {detail.can.ai ? (
        <div className="row" style={{ marginTop: ".4rem" }}>
          {detail.ai.status === "aktif" ? (
            <>
              <button type="button" disabled={busy} onClick={() => void aiAct("ambil_alih")}>Ambil alih</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => void aiAct("matikan")}>Matikan AI</button>
            </>
          ) : confirm === "aktifkan" ? (
            <>
              <button type="button" disabled={busy} onClick={() => { setConfirm(null); void aiAct("aktifkan"); }}>Ya, aktifkan kembali AI</button>
              <button type="button" className="secondary" onClick={() => setConfirm(null)}>Batal</button>
            </>
          ) : <button type="button" className="secondary" disabled={busy} onClick={() => setConfirm("aktifkan")}>Aktifkan kembali AI</button>}
        </div>
      ) : <p className="small muted">Anda tidak berizin mengubah status AI.</p>}
      {confirm === "aktifkan" && <p className="small muted">AI tidak menyala sendiri. Setelah diaktifkan, hanya pesan pelanggan baru setelah saat ini yang diproses; pesan lama tidak.</p>}
      {detail.jobs.length > 0 && (
        <details style={{ marginTop: ".4rem" }}><summary className="small">Pengiriman otomatis (simulasi)</summary>
          <ul className="small" style={{ margin: ".3rem 0 0 1rem", padding: 0 }}>{detail.jobs.map((j) => <li key={j.id}>{JOB_STATUS[j.status] ?? j.status}{j.reason ? ` · ${j.reason}` : ""} <span className="muted">{timeLabel(j.at)}</span></li>)}</ul>
        </details>
      )}
      {detail.aiEvents.length > 0 && (
        <details style={{ marginTop: ".4rem" }}><summary className="small">Riwayat status AI</summary>
          <ul className="small" style={{ margin: ".3rem 0 0 1rem", padding: 0 }}>{detail.aiEvents.map((e) => <li key={e.version}>v{e.version}: {e.from} → {e.to}{e.reason ? ` (${e.reason})` : ""} · {e.actor ?? "sistem"} · <span className="muted">{timeLabel(e.at)}</span></li>)}</ul>
        </details>
      )}

      <h3 style={{ marginTop: "1rem" }}>Tim &amp; PIC chat</h3>
      <p className="small" style={{ margin: ".2rem 0" }}>Tim: <strong>{c.teamName ?? "Belum ada"}</strong> · PIC chat: <strong>{c.assigneeName ?? "Belum ditugaskan"}</strong> {c.strayLead && <Badge kind="warn">Lead nyasar</Badge>} {c.escalated && <Badge kind="bad">Eskalasi</Badge>}</p>
      {detail.can.assign && (
        <>
          <label htmlFor="as-team">Tim</label>
          <select id="as-team" value={teamId} onChange={(e) => { setTeamId(e.target.value); setAssigneeId(""); }}><option value="">— tanpa tim —</option>{detail.routing.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <label htmlFor="as-pic">PIC chat (opsional)</label>
          <select id="as-pic" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}><option value="">— belum ditugaskan —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <button type="button" style={{ marginTop: ".5rem" }} disabled={busy} onClick={() => void run("POST", `/api/v1/conversations/${c.id}/assign`, { teamId: teamId || null, assigneeId: assigneeId || null, expectedVersion: c.assignVersion })}>Simpan penugasan</button>
          <p className="small muted" style={{ margin: ".3rem 0 0" }}>Jika pengguna lain mengubahnya lebih dulu, Anda akan diminta memuat ulang (tidak ada penimpaan diam-diam).</p>
        </>
      )}
      {detail.can.transfer && (
        <details style={{ marginTop: ".6rem" }}><summary className="small"><strong>Alihkan ke tim lain</strong> (percakapan yang sama)</summary>
          <label htmlFor="tr-team">Tim tujuan</label>
          <select id="tr-team" value={toTeam} onChange={(e) => setToTeam(e.target.value)}><option value="">— pilih tim —</option>{detail.routing.allTeams.filter((t) => t.id !== c.teamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <label className="check"><input type="checkbox" checked={stray} onChange={(e) => setStray(e.target.checked)} /> Tandai sebagai lead nyasar</label>
          <label htmlFor="tr-note">Catatan (opsional)</label>
          <input id="tr-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          <button type="button" style={{ marginTop: ".5rem" }} disabled={busy || !toTeam} onClick={() => void run("POST", `/api/v1/conversations/${c.id}/transfer`, { teamId: toTeam, strayLead: stray, note: note || undefined, expectedVersion: c.assignVersion }).then(() => { setToTeam(""); setNote(""); })}>Alihkan</button>
          <p className="small muted" style={{ margin: ".3rem 0 0" }}>Anggota tim tujuan hanya mendapat akses ke <strong>percakapan ini</strong>, bukan seluruh channel. Pelanggan tetap di nomor yang sama.</p>
        </details>
      )}
      {detail.can.assign && !detail.can.transfer && null}
      {detail.can.assign && (
        <button type="button" className="link small" style={{ marginTop: ".5rem" }} disabled={busy} onClick={() => void run("POST", `/api/v1/conversations/${c.id}/stray-lead`, { value: !c.strayLead })}>{c.strayLead ? "Hapus penanda Lead nyasar" : "Tandai Lead nyasar"}</button>
      )}
      {err && <Notice kind="error">{err}</Notice>}

      <h3 style={{ marginTop: "1rem" }}>Kontak</h3>
      <p className="small" style={{ margin: ".2rem 0" }}><strong>{detail.contact.displayName ?? "Tanpa nama"}</strong> <span className="muted mono">{detail.contact.publicRef}</span></p>
      {detail.contact.identities.map((i) => <div key={`${i.type}:${i.value}`} className="small mono">{i.type}: {i.value}</div>)}
      {detail.leadSources.length > 0 && <div className="small" style={{ marginTop: ".3rem" }}><strong>Sumber lead</strong>{detail.leadSources.map((l, k) => <div key={k}>{l.sourceType ?? "—"}{l.headline ? ` · ${l.headline}` : ""}{l.sourceUrl ? <> · <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer">tautan</a></> : null}</div>)}</div>}

      {detail.otherChannels.length > 0 && (
        <>
          <h3 style={{ marginTop: "1rem" }}>Riwayat di channel lain</h3>
          <p className="small muted" style={{ margin: ".1rem 0" }}>Hanya channel yang Anda berizin.</p>
          <ul className="small" style={{ margin: 0, paddingLeft: "1rem" }}>{detail.otherChannels.map((o) => <li key={o.id}><button type="button" className="link" onClick={() => onOpen(o.id)}>{o.channelName}</button> · {o.preview?.text ?? "—"} <span className="muted">{timeLabel(o.lastMessageAt)}</span></li>)}</ul>
        </>
      )}
      {detail.activity.length > 0 && (
        <>
          <h3 style={{ marginTop: "1rem" }}>Aktivitas penting</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: "1rem" }}>{detail.activity.map((a, k) => <li key={k}>{a.action.replace("conversation.", "")} · {a.actor ?? "sistem"} <span className="muted">{timeLabel(a.at)}</span></li>)}</ul>
        </>
      )}
    </aside>
  );
}
