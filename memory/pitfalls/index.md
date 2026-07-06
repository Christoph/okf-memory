# Pitfalls

Known bugs, portability hazards, and sharp edges.

* [Immediate cancel can be masked by a pending grace timer](/pitfalls/cancel-now-after-grace-timer.md) - The shared server's /cancel handler returns early when any cancel grace timer exists, so a later ?now=1 cancel may not pre-empt it.
* [Validator path portability](/pitfalls/skill-validator-path-portability.md) - The skill runbooks currently say to run node scripts/validate.mjs memory/, which only works from this checkout and is fragile for copied skills.
