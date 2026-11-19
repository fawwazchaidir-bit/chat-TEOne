import { describe, expect, it } from "vitest";
import { PermissionSet, canDelegate } from "@/modules/roles-permissions/engine";
import { PERMISSIONS } from "@/modules/roles-permissions/registry";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const g = (permission: string, scopeAll: boolean, channelIds: string[] = []) => ({ permission, scopeAll, channelIds });

describe("@tahap-1 engine izin (fungsi murni)", () => {
  it("default MENOLAK: tanpa grant, semua izin ditolak", () => {
    const p = new PermissionSet(false);
    for (const perm of PERMISSIONS) {
      expect(p.can(perm.key)).toBe(false);
      expect(p.can(perm.key, A)).toBe(false);
      expect(p.canAny(perm.key)).toBe(false);
    }
    expect(p.can("izin.tidak.dikenal")).toBe(false);
  });

  it("Super Admin diizinkan di mana saja", () => {
    const p = new PermissionSet(true);
    expect(p.can("channel.manage", A)).toBe(true);
    expect(p.can("killswitch.manage")).toBe(true);
  });

  it("cakupan channel: izin untuk channel A tidak berlaku untuk B", () => {
    const p = new PermissionSet(false, [g("chat.view", false, [A])]);
    expect(p.can("chat.view", A)).toBe(true);
    expect(p.can("chat.view", B)).toBe(false);
    expect(p.canAny("chat.view")).toBe(true);
  });

  it("aksi bercakupan channel tanpa channelId berarti 'semua channel' → hanya lolos jika izin 'semua'", () => {
    expect(new PermissionSet(false, [g("channel.manage", false, [A])]).can("channel.manage")).toBe(false);
    expect(new PermissionSet(false, [g("channel.manage", true)]).can("channel.manage")).toBe(true);
  });

  it("izin 'semua channel' berlaku untuk channel mana pun", () => {
    const p = new PermissionSet(false, [g("chat.view", true)]);
    expect(p.can("chat.view", A) && p.can("chat.view", B)).toBe(true);
  });

  it("penolakan spesifik pengguna MENGALAHKAN izin dari peran", () => {
    const p = new PermissionSet(false, [g("chat.view", true)], [g("chat.view", false, [B])]);
    expect(p.can("chat.view", A)).toBe(true);
    expect(p.can("chat.view", B)).toBe(false);
    expect(p.can("chat.view")).toBe(false); // ada penolakan sebagian → bukan "semua channel"
    const denyAll = new PermissionSet(false, [g("chat.view", true)], [g("chat.view", true)]);
    expect(denyAll.can("chat.view", A)).toBe(false);
    expect(denyAll.canAny("chat.view")).toBe(false);
  });

  it("izin global (tidak bercakupan channel) memerlukan scope 'semua' dan tidak ada penolakan", () => {
    expect(new PermissionSet(false, [g("user.manage", true)]).can("user.manage")).toBe(true);
    expect(new PermissionSet(false, [g("user.manage", true)], [g("user.manage", true)]).can("user.manage")).toBe(false);
    // grant bercakupan channel pada izin global diabaikan
    expect(new PermissionSet(false, [g("user.manage", false, [A])]).can("user.manage")).toBe(false);
  });

  it("filterChannels hanya mengembalikan channel yang tercakup", () => {
    const p = new PermissionSet(false, [g("channel.view", false, [A])]);
    expect(p.filterChannels("channel.view", [{ id: A }, { id: B }])).toEqual([{ id: A }]);
  });

  it("anti-eskalasi: hanya boleh memberikan yang dimiliki (termasuk cakupan)", () => {
    const actor = new PermissionSet(false, [g("chat.view", false, [A]), g("user.manage", true)]);
    expect(canDelegate(actor, g("chat.view", false, [A]))).toBe(true);
    expect(canDelegate(actor, g("chat.view", false, [A, B]))).toBe(false);
    expect(canDelegate(actor, g("chat.view", true))).toBe(false);
    expect(canDelegate(actor, g("chat.reply", false, [A]))).toBe(false);
    expect(canDelegate(actor, g("user.manage", true))).toBe(true);
    expect(canDelegate(actor, g("izin.palsu", true))).toBe(false);
  });

  it("izin khusus Super Admin tidak dapat didelegasikan oleh non-Super Admin", () => {
    const actor = new PermissionSet(false, [g("killswitch.manage", true)]);
    expect(canDelegate(actor, g("killswitch.manage", true))).toBe(false);
    expect(canDelegate(new PermissionSet(true), g("killswitch.manage", true))).toBe(true);
  });

  it("registri: tiap izin memiliki label dan penanda ketersediaan", () => {
    expect(PERMISSIONS.length).toBe(19);
    for (const p of PERMISSIONS) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(typeof p.available).toBe("boolean");
    }
  });
});
