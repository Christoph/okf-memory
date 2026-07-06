---
type: Plan
title: Deterministic OKF memory drafts and UI updates
description: Make okf-memory deterministic, extension-friendly, and easier to update through the UI.
status: approved
branch: iterator/preserve-root-memory-index
created: 2026-07-06
timestamp: 2026-07-06T14:32:22.059Z
---

# Goal

Make okf-memory more deterministic and extension-friendly. Chunks should be saved as draft files early, the server should read chunk files and identify them by slug, initialization should create guidance for other extensions on how to read and save memories, and the UI should let users browse all memories and comment-driven updates.

# Architecture

Keep the OKF memory bundle as the durable source of truth. Introduce or refine a draft-chunk persistence path so planned chunks exist on disk before implementation, update server-side loading to read memory files directly and derive stable identities from slugs, and ensure initialization writes an extension-facing memory contract document. UI changes should consume the same file-backed model so browser state reflects disk state rather than transient generated state.

# Dependencies

(none)

# Key decisions

Use slug-based identifiers for memory/chunk records to make server/UI behavior stable across sessions. Preserve legacy files when migrating or starting fresh, and avoid hidden destructive rewrites. Treat draft chunk files as first-class OKF documents with explicit status rather than ephemeral planning output. Add comment/update flows that append or rewrite through the established OKF writer path instead of ad-hoc UI-only mutation.

# Product fit

This improves trust in iterator and okf-memory by making plans and chunks inspectable, reproducible, and shareable with other extensions. A browser UI that lists every memory and supports per-memory update comments makes the memory plane easier to review and maintain, while the initialization guidance lowers integration friction for future extensions.

# Chunks

* [Extension memory contract](/chunks/extension-memory-contract.md) - Write and document a memory contract file during initialization so other extensions know how to read, identify, and save OKF memories safely.
* [Slugged draft chunk model](/chunks/slugged-draft-chunk-model.md) - Persist planned chunks as draft OKF files early and make slug/file identity the canonical identifier used by gather/server/UI payloads.
* [Dashboard all-memories browser](/chunks/dashboard-all-memories-browser.md) - Update the dashboard UI to show every memory concept, not just area counts and plan/chunk cards, with stable slug identifiers and per-memory actions.
* [Comment-driven memory updates](/chunks/comment-driven-memory-updates.md) - Let users request updates for any displayed memory via a comment and return deterministic dashboard actions that the skill can turn into reviewed memory edits.
