#!/usr/bin/env node
/**
 * Pra-pemeriksaan Chromium untuk E2E (audit ulang Gate 1): apakah lingkungan ini DAPAT menjalankan peramban?
 * Di sebagian sandbox Chromium gagal dengan `socket() EPERM` — itu keterbatasan lingkungan, BUKAN kegagalan aplikasi dan BUKAN bukti lulus.
 * `verify-all.sh` memakai ini untuk menandai langkah E2E sebagai TIDAK DAPAT DIJALANKAN (dengan alasannya) alih-alih gagal samar.
 * Keluar 0 bila peramban dapat dibuka dan membuka halaman kosong; 1 (dengan baris alasan di stderr) bila tidak.
 */
import { chromium } from "@playwright/test";

try {
  const browser = await chromium.launch({ args: ["--no-sandbox"], ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) });
  const page = await browser.newPage();
  await page.goto("about:blank");
  await browser.close();
  console.log("Chromium dapat dijalankan");
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e).split("\n").find((l) => l.trim()) ?? "Chromium tidak dapat dijalankan");
  process.exit(1);
}
