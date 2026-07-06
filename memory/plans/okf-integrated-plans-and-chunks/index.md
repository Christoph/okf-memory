# OKF-integrated plans and chunks

Plan: [OKF-integrated plans and chunks](../okf-integrated-plans-and-chunks.md)

## Chunks

* [Preserve root memory index](preserve-root-memory-index.md) - ✅ done · small · Make plan creation merge into the existing OKF root index instead of replacing project-memory metadata and area links.
* [Write OKF plan concepts](write-okf-plan-concepts.md) - ⬜ pending · medium · depends: preserve-root-memory-index · Write approved plans as type Plan OKF concept files under memory/plans with regenerated plan indexes.
* [Write OKF chunk concepts](write-okf-chunk-concepts.md) - ⬜ pending · medium · depends: write-okf-plan-concepts · Write each implementation chunk as a separate type Work Chunk concept beneath its plan directory.
* [Cover integrated plan flow](cover-integrated-plan-flow.md) - ⬜ pending · medium · depends: write-okf-plan-concepts, write-okf-chunk-concepts · Add tests and fixtures proving integrated plans and chunks are discovered, rendered, validated, and non-destructive.
