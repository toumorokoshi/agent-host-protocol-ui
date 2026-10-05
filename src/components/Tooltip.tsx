import type React from "react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TooltipProps {
	content?: string;
	children: ReactNode;
	className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, className }) => {
	const [isVisible, setIsVisible] = useState(false);
	const [coords, setCoords] = useState<{
		top: number;
		left: number;
		placementY: "top" | "bottom";
		alignmentX: "center" | "left" | "right";
	}>({
		top: 0,
		left: 0,
		placementY: "top",
		alignmentX: "center",
	});
	const triggerRef = useRef<HTMLSpanElement>(null);

	const showTooltip = () => {
		if (!triggerRef.current || !content) return;
		const rect = triggerRef.current.getBoundingClientRect();
		const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1000;

		// Vertical placement: place below if too close to top of viewport
		const placementY = rect.top < 60 ? "bottom" : "top";
		const top = placementY === "top" ? rect.top - 6 : rect.bottom + 6;

		// Horizontal alignment: avoid overflow on left/right edges
		let left = rect.left + rect.width / 2;
		let alignmentX: "center" | "left" | "right" = "center";

		if (rect.left < 160) {
			// Near left edge (e.g. sidebar): align with left edge of trigger
			left = Math.max(8, rect.left);
			alignmentX = "left";
		} else if (rect.right > viewportWidth - 160) {
			// Near right edge: align with right edge of trigger
			left = Math.min(viewportWidth - 8, rect.right);
			alignmentX = "right";
		}

		setCoords({ top, left, placementY, alignmentX });
		setIsVisible(true);
	};

	const hideTooltip = () => {
		setIsVisible(false);
	};

	// Hide on scroll to prevent detached floating tooltips
	useEffect(() => {
		if (!isVisible) return;
		const handleScroll = () => setIsVisible(false);
		window.addEventListener("scroll", handleScroll, true);
		return () => window.removeEventListener("scroll", handleScroll, true);
	}, [isVisible]);

	// Build transform based on vertical and horizontal alignment
	const getTransform = () => {
		const transX = coords.alignmentX === "left" ? "0%" : coords.alignmentX === "right" ? "-100%" : "-50%";
		const transY = coords.placementY === "top" ? "-100%" : "0%";
		return `translate(${transX}, ${transY})`;
	};

	const tooltipElement =
		isVisible && typeof document !== "undefined" && content
			? createPortal(
					<div
						style={{
							position: "fixed",
							top: `${coords.top}px`,
							left: `${coords.left}px`,
							transform: getTransform(),
							pointerEvents: "none",
							zIndex: 99999,
						}}
					>
						<div className="ui-tooltip" role="tooltip">
							{content}
						</div>
					</div>,
					document.body,
				)
			: null;

	return (
		<span
			ref={triggerRef}
			className={`tooltip-trigger ${className || ""}`}
			onMouseEnter={showTooltip}
			onMouseLeave={hideTooltip}
			onClick={hideTooltip}
			title={content}
			style={{ display: "inline-flex", alignItems: "center", maxWidth: "100%" }}
		>
			{children}
			{tooltipElement}
		</span>
	);
};
