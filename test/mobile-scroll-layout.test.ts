import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("Mobile Web Scroll & Layout Constraints", () => {
	const cssPath = path.resolve(process.cwd(), "src/styles/index.css");
	const cssContent = fs.readFileSync(cssPath, "utf-8");
	const appTsxPath = path.resolve(process.cwd(), "src/App.tsx");
	const appTsxContent = fs.readFileSync(appTsxPath, "utf-8");
	const chatTimelineTsxPath = path.resolve(process.cwd(), "src/components/ChatTimeline.tsx");
	const chatTimelineContent = fs.readFileSync(chatTimelineTsxPath, "utf-8");

	it("ensures layout container classes match index.css definitions with flex and min-height: 0", () => {
		// App.tsx must attach both workspace-layout and app-layout
		assert.match(
			appTsxContent,
			/className="[^"]*workspace-layout[^"]*"/,
			"App.tsx must include workspace-layout class",
		);
		assert.match(appTsxContent, /className="[^"]*app-layout[^"]*"/, "App.tsx must include app-layout class");

		// index.css must style both .workspace-layout and .app-layout
		assert.match(
			cssContent,
			/\.workspace-layout,\s*\n?\.app-layout\s*\{[^}]*display:\s*flex/s,
			"index.css must define display: flex on .workspace-layout and .app-layout",
		);
		assert.match(
			cssContent,
			/\.workspace-layout,\s*\n?\.app-layout\s*\{[^}]*min-height:\s*0/s,
			"index.css must define min-height: 0 on .workspace-layout and .app-layout",
		);
		assert.match(
			cssContent,
			/\.workspace-layout,\s*\n?\.app-layout\s*\{[^}]*overflow:\s*hidden/s,
			"index.css must define overflow: hidden on .workspace-layout and .app-layout",
		);
	});

	it("ensures mobile media query applies flex and min-height constraints", () => {
		// Find @media (max-width: 768px) block
		const mobileMediaIndex = cssContent.indexOf("@media (max-width: 768px)");
		assert.ok(mobileMediaIndex !== -1, "Mobile media query must be present");

		const mobileSection = cssContent.slice(mobileMediaIndex);
		assert.match(
			mobileSection,
			/\.workspace-layout,\s*\n?\s*\.app-layout\s*\{[^}]*min-height:\s*0/s,
			"Mobile media query must define min-height: 0 for .workspace-layout, .app-layout",
		);
		assert.match(
			mobileSection,
			/\.chat-view\s*\{[^}]*min-height:\s*0/s,
			"Mobile media query must define min-height: 0 for .chat-view",
		);
		assert.match(
			mobileSection,
			/\.chat-timeline\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/s,
			"Mobile media query must define -webkit-overflow-scrolling: touch for .chat-timeline",
		);
		assert.match(
			mobileSection,
			/\.chat-timeline\s*\{[^}]*overscroll-behavior-y:\s*contain/s,
			"Mobile media query must define overscroll-behavior-y: contain for .chat-timeline",
		);
	});

	it("ensures chat-view, chat-timeline, and composer have strict flex and scroll styling", () => {
		// .chat-view flex column constraints
		assert.match(
			cssContent,
			/\.chat-view\s*\{[^}]*min-height:\s*0/s,
			"chat-view must have min-height: 0 to prevent overflow blowouts",
		);
		assert.match(
			cssContent,
			/\.chat-view\s*\{[^}]*overflow:\s*hidden/s,
			"chat-view must constrain overflow to its own box",
		);

		// .chat-timeline scrolling and containment
		assert.match(
			cssContent,
			/\.chat-timeline\s*\{[^}]*min-height:\s*0/s,
			"chat-timeline must have min-height: 0 to enable flex-child scrolling",
		);
		assert.match(
			cssContent,
			/\.chat-timeline\s*\{[^}]*overflow-y:\s*auto/s,
			"chat-timeline must have overflow-y: auto",
		);
		assert.match(
			cssContent,
			/\.chat-timeline\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/s,
			"chat-timeline must have -webkit-overflow-scrolling: touch",
		);
		assert.match(
			cssContent,
			/\.chat-timeline\s*\{[^}]*overscroll-behavior-y:\s*contain/s,
			"chat-timeline must contain overscroll gestures",
		);

		// .composer flex-shrink constraint
		assert.match(
			cssContent,
			/\.composer\s*\{[^}]*flex-shrink:\s*0/s,
			"composer must have flex-shrink: 0 so it is never crushed by timeline expansion",
		);

		// .scroll-to-bottom-btn styles
		assert.match(
			cssContent,
			/\.scroll-to-bottom-btn\s*\{[^}]*position:\s*sticky/s,
			"scroll-to-bottom button must use sticky positioning",
		);
	});

	it("ensures ChatTimeline component implements scroll tracking and mobile keyboard resilience", () => {
		assert.match(chatTimelineContent, /timelineRef\s*=\s*useRef/, "ChatTimeline must manage a timeline DOM ref");
		assert.match(chatTimelineContent, /onScroll=\{handleScroll\}/, "ChatTimeline must attach scroll listener");
		assert.match(chatTimelineContent, /scrollToBottom/, "ChatTimeline must provide scrollToBottom callback");
		assert.match(
			chatTimelineContent,
			/visualViewport.*addEventListener\("resize"/,
			"ChatTimeline must listen to visualViewport resize for mobile virtual keyboards",
		);
		assert.match(
			chatTimelineContent,
			/className="scroll-to-bottom-btn"/,
			"ChatTimeline must render scroll-to-bottom button when scrolled up",
		);
	});

	it("ensures App.tsx attaches session key to ChatTimeline for clean session scroll resets", () => {
		assert.match(
			appTsxContent,
			/<ChatTimeline\s+key=\{activeSession\.id\}/,
			"App.tsx must set key={activeSession.id} on ChatTimeline",
		);
	});
});
