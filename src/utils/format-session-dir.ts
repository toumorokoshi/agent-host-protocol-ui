/**
 * Utility functions for session working directory display and tooltips.
 */

/**
 * Extracts the base folder name from a working directory path, safely handling
 * trailing slashes and both Unix/Windows path separators.
 */
export function formatDirectoryBase(workingDirectory?: string): string {
	if (!workingDirectory) return "workspace";
	const trimmed = workingDirectory.trim();
	if (!trimmed || trimmed === "/" || trimmed === "\\") return trimmed || "workspace";

	const clean = trimmed.replace(/[/\\]+$/, "");
	if (!clean) return trimmed;

	const parts = clean.split(/[/\\]/);
	return parts.pop() || clean || "workspace";
}

/**
 * Returns the full directory path for display in a tooltip.
 */
export function formatDirectoryTooltip(workingDirectory?: string): string {
	if (!workingDirectory?.trim()) return "No directory specified";
	return workingDirectory.trim();
}
