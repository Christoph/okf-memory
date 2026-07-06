# Chunks

* [Extension memory contract](extension-memory-contract.md) - ✅ done · medium · Write and document a memory contract file during initialization so other extensions know how to read, identify, and save OKF memories safely.
* [Slugged draft chunk model](slugged-draft-chunk-model.md) - ✅ done · medium · Persist planned chunks as draft OKF files early and make slug/file identity the canonical identifier used by gather/server/UI payloads.
* [Dashboard all-memories browser](dashboard-all-memories-browser.md) - ⬜ pending · medium · depends: slugged-draft-chunk-model, extension-memory-contract · Update the dashboard UI to show every memory concept, not just area counts and plan/chunk cards, with stable slug identifiers and per-memory actions.
* [Comment-driven memory updates](comment-driven-memory-updates.md) - ⬜ pending · medium · depends: dashboard-all-memories-browser · Let users request updates for any displayed memory via a comment and return deterministic dashboard actions that the skill can turn into reviewed memory edits.
