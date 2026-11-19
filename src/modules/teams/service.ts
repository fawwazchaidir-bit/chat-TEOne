import { eq, inArray } from "drizzle-orm";
import { channels, teamChannels, teamMembers, teams, users } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import type { Ctx } from "@/modules/shared/context";
import { mapDbError } from "@/modules/shared/db-errors";

const UNIQUE = { teams_name_unique: ["TEAM_NAME_TAKEN", "Nama tim sudah dipakai."] as [string, string] };
const need = (ctx: Ctx) => { if (!ctx.perms.can("team.manage")) throw forbidden(); };

async function hydrate(ctx: Ctx, rows: (typeof teams.$inferSelect)[]) {
  const db = getDb();
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const members = await db.select({ teamId: teamMembers.teamId, id: users.id, name: users.name, email: users.email }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(inArray(teamMembers.teamId, ids));
  const tcs = await db.select({ teamId: teamChannels.teamId, id: channels.id, name: channels.name, archivedAt: channels.archivedAt }).from(teamChannels).innerJoin(channels, eq(channels.id, teamChannels.channelId)).where(inArray(teamChannels.teamId, ids));
  return rows.map((t) => ({
    ...t,
    members: members.filter((m) => m.teamId === t.id).map(({ teamId: _t, ...m }) => m),
    // Nama channel hanya ditampilkan untuk channel yang boleh dilihat pengguna ini.
    channels: tcs.filter((c) => c.teamId === t.id && ctx.perms.can("channel.view", c.id)).map(({ teamId: _t, ...c }) => c),
  }));
}

export async function listTeams(ctx: Ctx) {
  need(ctx);
  return hydrate(ctx, await getDb().select().from(teams).orderBy(teams.name));
}

export async function getTeam(ctx: Ctx, id: string) {
  need(ctx);
  const [t] = await getDb().select().from(teams).where(eq(teams.id, id));
  if (!t) throw notFound("Tim tidak ditemukan.");
  return (await hydrate(ctx, [t]))[0]!;
}

export async function createTeam(ctx: Ctx, input: { name: string; description?: string }) {
  need(ctx);
  try {
    return await getDb().transaction(async (tx) => {
      const [t] = await tx.insert(teams).values({ name: input.name.trim(), description: input.description?.trim() ?? "", createdBy: ctx.user.id, updatedBy: ctx.user.id }).returning();
      await writeAudit(tx, { ...auditFor(ctx), action: "team.created", objectType: "team", objectId: t!.id, metadata: { name: t!.name } });
      return t!;
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
}

export async function updateTeam(ctx: Ctx, id: string, patch: { name?: string; description?: string; isActive?: boolean }) {
  need(ctx);
  await getTeam(ctx, id);
  try {
    return await getDb().transaction(async (tx) => {
      const [t] = await tx.update(teams).set({ ...patch, ...(patch.name !== undefined && { name: patch.name.trim() }), updatedAt: new Date(), updatedBy: ctx.user.id }).where(eq(teams.id, id)).returning();
      await writeAudit(tx, { ...auditFor(ctx), action: "team.updated", objectType: "team", objectId: id, metadata: { patch } });
      return t!;
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
}

export async function setTeamMembers(ctx: Ctx, id: string, userIds: string[]) {
  need(ctx);
  await getTeam(ctx, id);
  const unique = [...new Set(userIds)];
  await getDb().transaction(async (tx) => {
    if (unique.length) {
      const found = await tx.select({ id: users.id }).from(users).where(inArray(users.id, unique));
      if (found.length !== unique.length) throw badRequest("Ada pengguna yang tidak ditemukan.", undefined, "INVALID_REFERENCE");
    }
    await tx.delete(teamMembers).where(eq(teamMembers.teamId, id));
    if (unique.length) await tx.insert(teamMembers).values(unique.map((userId) => ({ teamId: id, userId })));
    await writeAudit(tx, { ...auditFor(ctx), action: "team.members_changed", objectType: "team", objectId: id, metadata: { count: unique.length, userIds: unique } });
  });
}

/** Menetapkan channel yang ditangani tim. Pengguna hanya dapat memasang channel yang boleh ia lihat. */
export async function setTeamChannels(ctx: Ctx, id: string, channelIds: string[]) {
  need(ctx);
  const team = await getTeam(ctx, id);
  const unique = [...new Set(channelIds)];
  const hiddenExisting = (await getDb().select({ id: teamChannels.channelId }).from(teamChannels).where(eq(teamChannels.teamId, id))).map((r) => r.id).filter((cid) => !ctx.perms.can("channel.view", cid));
  for (const cid of unique) if (!ctx.perms.can("channel.view", cid)) throw forbidden("Anda hanya dapat memilih channel yang dapat Anda lihat.", "CHANNEL_OUT_OF_SCOPE");
  const final = [...new Set([...unique, ...hiddenExisting])]; // channel di luar cakupan pengguna tidak ikut terhapus
  await getDb().transaction(async (tx) => {
    if (final.length) {
      const found = await tx.select({ id: channels.id }).from(channels).where(inArray(channels.id, final));
      if (found.length !== final.length) throw badRequest("Ada channel yang tidak ditemukan.", undefined, "INVALID_REFERENCE");
    }
    await tx.delete(teamChannels).where(eq(teamChannels.teamId, id));
    if (final.length) await tx.insert(teamChannels).values(final.map((channelId) => ({ teamId: id, channelId })));
    await writeAudit(tx, { ...auditFor(ctx), action: "team.channels_changed", objectType: "team", objectId: id, metadata: { team: team.name, channelIds: final } });
  });
}
