export interface DirectoryOption {
	path: string;
	label: string;
	source: "default" | "session";
}

/**
 * Extracts a deduplicated list of candidate working directories from host default
 * and existing agent sessions, annotating them with helpful source labels.
 */
export function extractDirectoryOptions(
	defaultDirectory?: string,
	sessions?: Array<{ workingDirectory?: string; title?: string }>,
): DirectoryOption[] {
	const options: DirectoryOption[] = [];
	const seen = new Set<string>();

	const cleanDefault = defaultDirectory?.trim();
	if (cleanDefault) {
		seen.add(cleanDefault);
		options.push({
			path: cleanDefault,
			label: `${cleanDefault} (Host Default)`,
			source: "default",
		});
	}

	if (sessions && Array.isArray(sessions)) {
		for (const session of sessions) {
			const cleanPath = session.workingDirectory?.trim();
			if (!cleanPath || seen.has(cleanPath)) continue;

			seen.add(cleanPath);
			const title = session.title?.trim();
			const hasDescriptiveTitle = Boolean(title && title !== "New Agent Session");

			options.push({
				path: cleanPath,
				label: hasDescriptiveTitle ? `${cleanPath} (${title})` : cleanPath,
				source: "session",
			});
		}
	}

	return options;
}
