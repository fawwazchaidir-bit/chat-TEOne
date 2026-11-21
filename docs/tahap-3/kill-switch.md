# Kill switch

Menghentikan **semua pengiriman otomatis** (balasan AI, follow-up, dsb.). Balasan **manual** admin tidak terkena kill switch otomatisasi.

## Empat tingkat
| Tingkat | Cara | Siapa | Tampil |
|---|---|---|---|
| **Per chat** | Aksi *Matikan AI* / *Kill switch chat* pada percakapan (AI Off), atau cakupan `chat` di halaman Kill switch | `ai.toggle` pada channel percakapan / `killswitch.manage` | Status AI percakapan |
| **Per channel** | **Jeda otomatisasi channel** (halaman Channel) | `killswitch.channel` pada channel itu, atau `killswitch.manage` | Spanduk di inbox + penanda pada navigasi channel |
| **Per fitur** | Halaman *Kill switch & flag* (`ai_reply`, `follow_up`, …) | `killswitch.manage` (Super Admin) | Spanduk inbox |
| **Global** | Halaman *Kill switch & flag* | `killswitch.manage` | Spanduk inbox |

## Jaminan
- **Diperiksa tepat sebelum kirim**: di titik komit pipeline **dan** sekali lagi tepat sebelum panggilan Meta (`preSend`). Kill switch menyala di antara keduanya → pesan `gagal` pasti, **0 panggilan Meta**.
- **Efektif < 1 menit** — tanpa cache; berlaku pada pemeriksaan berikutnya (uji: job dibatalkan dalam hitungan milidetik; asersi < 60 detik).
- **Fail-closed**: bila status kill switch tidak dapat dibaca → otomatisasi **diblokir**.
- **Tidak pernah menyala kembali sendiri**: tidak ada timer, kedaluwarsa, atau penjadwal; satu-satunya jalur melepas adalah tindakan pengguna berizin yang diaudit. Dijaga test struktural dan uji perilaku (pemeliharaan tidak melepasnya).
- Mengaktifkan butuh **alasan**; mengaktifkan dan melepas masing-masing diaudit (`kill_switch.engaged` / `kill_switch.released`); job yang dibatalkan diaudit (`automation.job_cancelled`).
- Job yang dibatalkan kill switch **tidak hidup kembali** saat dilepas; hanya pesan pelanggan baru berikutnya yang diproses.

## Yang tidak dilakukan kill switch
Tidak menarik pesan yang sudah dikirim ke Meta (tampil "sedang dikirim / belum pasti"), tidak menonaktifkan penerimaan pesan masuk, tidak menghentikan balasan manual.
