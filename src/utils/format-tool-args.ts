/**
 * Utility for formatting and previewing tool arguments in the UI.
 */

/**
 * Extracts a concise one-line preview of tool arguments (e.g. command or path)
 * for the slim collapsed header.
 */
export function formatToolArgumentsPreview(args: Record<string, unknown> | string): string {
	if (!args) return "";
	if (typeof args === "string") {
		const trimmed = args.trim().split("\n")[0];
		return trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed;
	}
	if (typeof args === "object") {
		const target = args.command || args.path || args.absolutePath || args.filePath || args.query || args.url;
		if (typeof target === "string" && target.trim()) {
			const trimmed = target.trim().split("\n")[0];
			return trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed;
		}
		const firstKey = Object.keys(args)[0];
		if (firstKey && typeof args[firstKey] === "string") {
			const val = String(args[firstKey]).trim().split("\n")[0];
			return val.length > 35 ? `${firstKey}: ${val.slice(0, 32)}...` : `${firstKey}: ${val}`;
		}
	}
	return "";
}
