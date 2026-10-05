export interface DirectoryOption {
	path: string;
	label: string;
	source: "default" | "session";
}

/**
 * Extracts a deduplicated list of candidate working directories from host default
 * and existing agent sessions, sorted in order of directory with most recent session first.
 */
export function extractDirectoryOptions(
	defaultDirectory?: string,
	sessions?: Array<{ workingDirectory?: string; title?: string; modifiedAt?: string }>,
): DirectoryOption[] {
	const dirTimestamps = new Map<string, number>();
	const allDirs = new Set<string>();

	const cleanDefault = defaultDirectory?.trim();
	if (cleanDefault) {
		allDirs.add(cleanDefault);
		dirTimestamps.set(cleanDefault, 0);
	}

	if (sessions && Array.isArray(sessions)) {
		for (const session of sessions) {
			const cleanPath = session.workingDirectory?.trim();
			if (!cleanPath) continue;

			allDirs.add(cleanPath);

			const rawTime = session.modifiedAt ? new Date(session.modifiedAt).getTime() : 0;
			const time = Number.isNaN(rawTime) ? 0 : rawTime;
			const existingTime = dirTimestamps.get(cleanPath) ?? -1;

			if (time > existingTime) {
				dirTimestamps.set(cleanPath, time);
			}
		}
	}

	const sortedDirs = Array.from(allDirs).sort((a, b) => {
		const timeA = dirTimestamps.get(a) ?? -1;
		const timeB = dirTimestamps.get(b) ?? -1;
		if (timeB !== timeA) {
			return timeB - timeA; // Descending: most recent session first
		}
		return a.localeCompare(b);
	});

	return sortedDirs.map((dir) => {
		const isDefault = Boolean(cleanDefault && dir === cleanDefault);
		return {
			path: dir,
			label: isDefault ? `${dir} (Host Default)` : dir,
			source: isDefault ? "default" : "session",
		};
	});
}
