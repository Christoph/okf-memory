const COMMANDS = [
	{
		name: "okf",
		description: "Open the okf-memory project memory plane dashboard.",
	},
	{
		name: "okf-init",
		description: "Initialize an okf-memory OKF bundle with browser review.",
	},
	{
		name: "okf-consolidate",
		description:
			"Review, update, merge, prune, or stale-check an existing okf-memory bundle.",
	},
	{
		name: "okf-memorize",
		description:
			"Draft reviewed okf-memory updates from commits since last_memorized_commit.",
	},
];

export default function okfMemoryExtension(pi) {
	for (const command of COMMANDS) {
		pi.registerCommand(command.name, {
			description: command.description,
			handler: async (args = "") => {
				const trimmedArgs = args.trim();
				pi.sendUserMessage(
					`/skill:${command.name}${trimmedArgs ? ` ${trimmedArgs}` : ""}`,
				);
			},
		});
	}
}
