# Batas arsitektur

ESLint menjaga batas source tanpa memindahkan file atau mengubah perilaku:

- `app/**` di luar `app/api/**` tidak boleh mengimpor `pg`, Node built-ins (`node:*`, `fs`, `child_process`), repository `lib/**/postgres`, `lib/runtime/**`, `lib/processing`, `lib/extraction`, atau provider acquisition `lib/acquisition/credentialed` dan `lib/acquisition/ytdlp`. Route handler tetap menjadi entry boundary server.
- `lib/**` tidak boleh mengimpor `app/**`, termasuk alias `@/app`.
- Modul bersama yang boleh dipakai klien: `lib/workspace/labels-id.ts`, `lib/hypothesis/presentation.ts`, dan `lib/domain/types.ts`.

Target owner: monorepo npm workspaces (`apps/web`, `apps/api`, `packages/contracts`); Next route handlers tetap hingga API dipisahkan; kontrak API dan skema DB tidak berubah; satu Postgres.

## Rencana

1. **PR 1:** tegakkan batas lint tanpa relokasi.
2. **PR 2:** tetapkan shared contract minimal; ekstrak DTO dan helper pure tanpa mengubah wire format.
3. **PR 3:** siapkan npm workspaces tanpa cutover runtime; pertahankan seluruh required checks.
4. **PR 4:** relokasi repository SQL, runtime, provider/acquisition, processing, dan worker ke `apps/api` atau package server internal; pertahankan data dan migrasi.
5. **PR 5:** pindahkan UI ke `apps/web`; pertahankan endpoint, response contract, dan production-build E2E.
6. **PR 6:** konfigurasi endpoint/proxy, secret, worker, readiness, dan validasi integrasi DB staging sebelum cutover; hapus konfigurasi lama setelah migrasi caller dan deploy.

Urutan PR 2–6 mengikuti inventaris faktual, bagian 8; tiap tahap harus menjaga perilaku kontrak dan menjalankan acceptance serta checks terkait.
