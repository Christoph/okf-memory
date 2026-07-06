# Architecture

How the okf-memory package, skills, servers, and memory bundle fit together.

* [Browser server contract](/architecture/browser-server-contract.md) - Interactive workflows run a short-lived local server that receives a JSON payload on stdin and returns exactly one JSON result on stdout.
* [OKF memory lifecycle](/architecture/okf-memory-lifecycle.md) - okf-memory manages a target repo's memory/ bundle through init, dashboard, consolidate, and memorize workflows.
* [Package and skill layout](/architecture/package-and-skill-layout.md) - The repo is a pi-installable package whose skills own the agent workflows and whose extension only forwards friendly commands.
