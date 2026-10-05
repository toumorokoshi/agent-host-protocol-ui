import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ahp_ui_theme_preference";

/**
 * Detect system color scheme preference.
 * Defaults to "dark" if neither "light" nor "dark" matches or if media queries are unsupported.
 */
export function getSystemTheme(): ResolvedTheme {
	if (typeof window !== "undefined" && window.matchMedia) {
		if (window.matchMedia("(prefers-color-scheme: light)").matches) {
			return "light";
		}
		if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
			return "dark";
		}
	}
	// Dark mode by default
	return "dark";
}

export function useTheme() {
	const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
		try {
			const saved = localStorage.getItem(THEME_STORAGE_KEY);
			if (saved === "system" || saved === "light" || saved === "dark") {
				return saved;
			}
		} catch {
			// Ignore localStorage access errors
		}
		return "system";
	});

	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

	// Listen to system color scheme changes dynamically
	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;

		const lightMedia = window.matchMedia("(prefers-color-scheme: light)");
		const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");

		const handleSystemChange = () => {
			setSystemTheme(getSystemTheme());
		};

		lightMedia.addEventListener("change", handleSystemChange);
		darkMedia.addEventListener("change", handleSystemChange);

		return () => {
			lightMedia.removeEventListener("change", handleSystemChange);
			darkMedia.removeEventListener("change", handleSystemChange);
		};
	}, []);

	// Resolved theme: if preference is "system", use detected system theme (defaults to dark); otherwise explicit preference
	const resolvedTheme: ResolvedTheme = themePreference === "system" ? systemTheme : themePreference;

	// Apply data-theme and data-theme-preference attributes to the root HTML element
	useEffect(() => {
		const root = document.documentElement;
		root.setAttribute("data-theme", resolvedTheme);
		root.setAttribute("data-theme-preference", themePreference);
	}, [resolvedTheme, themePreference]);

	const setTheme = (pref: ThemePreference) => {
		setThemePreference(pref);
		try {
			localStorage.setItem(THEME_STORAGE_KEY, pref);
		} catch {
			// Ignore localStorage access errors
		}
	};

	const cycleTheme = () => {
		if (themePreference === "system") {
			setTheme("light");
		} else if (themePreference === "light") {
			setTheme("dark");
		} else {
			setTheme("system");
		}
	};

	return {
		themePreference,
		resolvedTheme,
		setTheme,
		cycleTheme,
	};
}
