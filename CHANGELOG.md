# Changelog

Semua perubahan penting pada proyek ini didokumentasikan di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
dan proyek ini mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `README.md` — root README dengan quick start, stack, scripts, aturan domain
- `CONTRIBUTING.md` — aturan kontribusi, branch, commit, PR, DoD
- `docs/glossary.md` — kamus istilah & kode (S0-S13, A0, C1, E1, P1, P2, R1)
- `docs/setup.md` — panduan setup development
- `docs/faq-agent.md` — FAQ agent
- `docs/runbook.md` — panduan operasional
- `.github/pull_request_template.md` — template PR
- `.github/ISSUE_TEMPLATE/feature.md` — template feature request
- `.github/ISSUE_TEMPLATE/bug.md` — template bug report
- `.github/workflows/ci.yml` — CI workflow (lint, typecheck, test, build)
- `.editorconfig` — konfigurasi editor konsisten

### Changed
- `.gitignore` — ignore `*.tsbuildinfo`, `_bmad/`, `_bmad-output/`

### Fixed
- Hapus `tsconfig.tsbuildinfo` dari tracking

## [0.0.0] — 2026-10-05

### Added
- Initial commit
