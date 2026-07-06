---
type: Plan
title: Manifest-backed plan dependencies
description: Ground iterator plan dependencies in real project manifests.
status: approved
branch: iterator/preserve-root-memory-index
created: 2026-07-06
timestamp: 2026-07-06T17:06:38.980Z
---

# Goal

Make iterator plan dependencies reflect the project’s actual dependency manifests instead of freeform or inferred package names. When a plan is drafted, dependencies should come from Cargo.toml, package.json, pyproject.toml, go.mod, or the project’s equivalent dependency source so the plan review UI only shows real declared dependencies.

# Architecture

Add a manifest-discovery layer to the planning gather/draft path that detects the dependency manager used by the current project, parses the relevant manifest files, and returns normalized dependency entries for the plan payload. Keep the OKF memory bundle as the durable output, but treat dependencies as derived project metadata: the UI may display and let reviewers edit them, while the initial draft is grounded in package manifests. For this repository, package.json is the authoritative manifest and it currently declares no dependencies or devDependencies, so the generated dependency list should be empty unless package.json changes.

# Dependencies

(none)

# Key decisions

Prefer explicit manifest files over heuristic dependency guesses. Support common ecosystems incrementally through small parsers for package.json, Cargo.toml, pyproject.toml, and go.mod, with a safe empty list when no recognized dependency manifest or no declared dependencies exist. Preserve user edits from the review UI in the final approved plan, but make the initial dependency chips traceable to discovered manifest entries. Avoid adding new runtime libraries for parsing unless the target project already declares them or a format cannot be handled safely with existing tooling.

# Product fit

Manifest-backed dependencies make iterator plans more trustworthy and reviewable because dependency chips describe the actual project environment. This reduces stale or imaginary dependencies in OKF memory, helps future implementation chunks understand what libraries are available, and keeps the plan aligned with how the project is built. In okf-memory specifically, the current package.json has no external dependency declarations, so an empty dependency list is the accurate product behavior.

# Chunks

* [Extension memory contract](/chunks/extension-memory-contract.md) - Write and document a memory contract file during initialization so other extensions know how to read, identify, and save OKF memories safely.
* [Slugged draft chunk model](/chunks/slugged-draft-chunk-model.md) - Persist planned chunks as draft OKF files early and make slug/file identity the canonical identifier used by gather/server/UI payloads.
* [Dashboard all-memories browser](/chunks/dashboard-all-memories-browser.md) - Update the dashboard UI to show every memory concept, not just area counts and plan/chunk cards, with stable slug identifiers and per-memory actions.
* [Comment-driven memory updates](/chunks/comment-driven-memory-updates.md) - Let users request updates for any displayed memory via a comment and return deterministic dashboard actions that the skill can turn into reviewed memory edits.
* [Manifest dependency discovery](/chunks/manifest-dependency-discovery.md) - Detect and parse real project dependency manifests so plan gathering can supply dependency chips from package.json, Cargo.toml, pyproject.toml, go.mod, or an empty list when none are declared.
* [Plan dependency instructions](/chunks/plan-dependency-instructions.md) - Update iterator planning instructions and examples so agents use only gathered manifest dependencies when drafting the plan payload.
