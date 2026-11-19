import { vi } from "vitest";
import { currentTotp } from "@/modules/auth/totp";

/**
 * TOTP memiliki proteksi replay (satu langkah 30 detik hanya sekali pakai). Agar test dapat login berkali-kali
 * dengan akun yang sama, jam `Date` dimajukan 31 detik per kode baru. Hanya `Date` yang dipalsukan.
 */
export function installClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date());
}
export function removeClock() {
  vi.useRealTimers();
}
export function freshTotp(secret: string): string {
  vi.setSystemTime(Date.now() + 31_000);
  return currentTotp(secret);
}
