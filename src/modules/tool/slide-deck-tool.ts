import { z } from "zod";

const hexColorSchema = z
	.string()
	.trim()
	.regex(/^#?[0-9a-fA-F]{6}$/, "Use a 6-digit hex color")
	.default("#25adc5");

export const slideDeckInputSchema = z.object({
	title: z.string().trim().min(1).max(140),
	subtitle: z.string().trim().max(220).optional(),
	theme: z.enum(["minimal", "deodis", "midnight", "warm"]).default("deodis"),
	accentColor: hexColorSchema,
	aspectRatio: z.enum(["16:9", "4:3"]).default("16:9"),
	animation: z.enum(["rise", "fade", "none"]).default("rise"),
	height: z.number().int().min(360).max(900).default(560),
	showPrintButton: z.boolean().default(true),
	slides: z
		.array(
			z.object({
				layout: z
					.enum(["title", "section", "bullets", "two_column", "quote", "closing"])
					.default("bullets"),
				kicker: z.string().trim().max(80).optional(),
				title: z.string().trim().min(1).max(140),
				body: z.string().trim().max(900).optional(),
				bullets: z
					.array(z.string().trim().min(1).max(280))
					.max(8)
					.default([]),
				secondaryTitle: z.string().trim().max(100).optional(),
				secondaryBullets: z
					.array(z.string().trim().min(1).max(240))
					.max(6)
					.default([]),
				quote: z.string().trim().max(700).optional(),
				attribution: z.string().trim().max(120).optional(),
				metricValue: z.string().trim().max(80).optional(),
				metricLabel: z.string().trim().max(120).optional(),
				imageUrl: z.url().optional(),
				imageAlt: z.string().trim().max(160).optional(),
				footer: z.string().trim().max(180).optional(),
				notes: z.string().trim().max(1_200).optional(),
			}),
		)
		.min(1)
		.max(30),
});

export type SlideDeckInput = z.infer<typeof slideDeckInputSchema>;

type DeckSlide = SlideDeckInput["slides"][number];
type SlideFrame = {
	bullets: string[];
	secondaryBullets: string[];
	footer: string;
	note: string;
};

const themeClasses: Record<SlideDeckInput["theme"], string> = {
	minimal: "theme-minimal",
	deodis: "theme-deodis",
	midnight: "theme-midnight",
	warm: "theme-warm",
};

function escapeHtml(value: string | undefined) {
	return (value ?? "").replace(/[&<>'"]/g, (char) => {
		if (char === "&") return "&amp;";
		if (char === "<") return "&lt;";
		if (char === ">") return "&gt;";
		if (char === "'") return "&#39;";
		return "&quot;";
	});
}

function escapeJsonForHtml(value: unknown) {
	return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

function normalizeAccentColor(color: string) {
	const normalized = color.startsWith("#") ? color : `#${color}`;
	return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "#25adc5";
}

function aspectRatioCss(aspectRatio: SlideDeckInput["aspectRatio"]) {
	return aspectRatio === "4:3" ? "4 / 3" : "16 / 9";
}

function printPageSize(aspectRatio: SlideDeckInput["aspectRatio"]) {
	return aspectRatio === "4:3" ? "10in 7.5in" : "16in 9in";
}

function renderKicker(value: string | undefined) {
	return value ? `<p class="slide-kicker">${escapeHtml(value)}</p>` : "";
}

function renderBody(value: string | undefined) {
	return value ? `<p class="slide-body">${escapeHtml(value)}</p>` : "";
}

function renderBullets(bullets: string[], variant = "") {
	if (bullets.length === 0) return "";
	const className = variant ? `slide-bullets ${variant}` : "slide-bullets";
	return `<ul class="${className}">${bullets
		.map(
			(bullet, index) =>
				`<li class="fragment" data-fragment="${index}">${escapeHtml(bullet)}</li>`,
		)
		.join("")}</ul>`;
}

function renderMetric(input: { metricValue?: string; metricLabel?: string }) {
	if (!input.metricValue) return "";
	return `<div class="metric-card fragment" data-fragment="metric">
		<div class="metric-value">${escapeHtml(input.metricValue)}</div>
		${input.metricLabel ? `<div class="metric-label">${escapeHtml(input.metricLabel)}</div>` : ""}
	</div>`;
}

function renderImage(input: { imageUrl?: string; imageAlt?: string }) {
	if (!input.imageUrl) return "";
	return `<figure class="slide-image fragment" data-fragment="image">
		<img src="${escapeHtml(input.imageUrl)}" alt="${escapeHtml(input.imageAlt ?? "Slide visual")}" />
	</figure>`;
}

function createSlideFrame(slide: DeckSlide): SlideFrame {
	return {
		bullets: slide.bullets ?? [],
		secondaryBullets: slide.secondaryBullets ?? [],
		footer: slide.footer
			? `<p class="slide-footer">${escapeHtml(slide.footer)}</p>`
			: "",
		note: slide.notes
			? `<aside class="speaker-notes">${escapeHtml(slide.notes)}</aside>`
			: "",
	};
}

function renderTitleSlide(slide: DeckSlide, frame: SlideFrame) {
	return `<div class="slide-content title-layout">
		${renderKicker(slide.kicker)}
		<h1>${escapeHtml(slide.title)}</h1>
		${renderBody(slide.body)}
		${renderMetric(slide)}
		${frame.footer}
		${frame.note}
	</div>`;
}

function renderSectionSlide(
	slide: DeckSlide,
	frame: SlideFrame,
	index: number,
) {
	return `<div class="slide-content section-layout">
		${renderKicker(slide.kicker ?? `Section ${index + 1}`)}
		<h2>${escapeHtml(slide.title)}</h2>
		${renderBody(slide.body)}
		${frame.footer}
		${frame.note}
	</div>`;
}

function renderQuoteSlide(slide: DeckSlide, frame: SlideFrame) {
	const quote = slide.quote ?? slide.body ?? slide.title;
	return `<div class="slide-content quote-layout">
		${renderKicker(slide.kicker)}
		<blockquote>${escapeHtml(quote)}</blockquote>
		${slide.attribution ? `<p class="quote-attribution">${escapeHtml(slide.attribution)}</p>` : ""}
		${frame.footer}
		${frame.note}
	</div>`;
}

function renderTwoColumnSlide(slide: DeckSlide, frame: SlideFrame) {
	return `<div class="slide-content">
		${renderKicker(slide.kicker)}
		<h2>${escapeHtml(slide.title)}</h2>
		<div class="two-column-grid">
			<div>
				${renderBody(slide.body)}
				${renderBullets(frame.bullets)}
			</div>
			<div class="secondary-panel fragment" data-fragment="panel">
				${slide.secondaryTitle ? `<h3>${escapeHtml(slide.secondaryTitle)}</h3>` : ""}
				${renderMetric(slide)}
				${renderImage(slide)}
				${renderBullets(frame.secondaryBullets, "compact")}
			</div>
		</div>
		${frame.footer}
		${frame.note}
	</div>`;
}

function renderClosingSlide(slide: DeckSlide, frame: SlideFrame) {
	return `<div class="slide-content closing-layout">
		${renderKicker(slide.kicker)}
		<h2>${escapeHtml(slide.title)}</h2>
		${renderBody(slide.body)}
		${renderBullets(frame.bullets, "centered")}
		${frame.footer}
		${frame.note}
	</div>`;
}

function renderBulletSlide(slide: DeckSlide, frame: SlideFrame) {
	return `<div class="slide-content">
		${renderKicker(slide.kicker)}
		<h2>${escapeHtml(slide.title)}</h2>
		${renderBody(slide.body)}
		${renderMetric(slide)}
		${renderImage(slide)}
		${renderBullets(frame.bullets)}
		${frame.footer}
		${frame.note}
	</div>`;
}

const slideRenderers = {
	title: renderTitleSlide,
	section: renderSectionSlide,
	bullets: renderBulletSlide,
	two_column: renderTwoColumnSlide,
	quote: renderQuoteSlide,
	closing: renderClosingSlide,
} satisfies Record<
	DeckSlide["layout"],
	(slide: DeckSlide, frame: SlideFrame, index: number) => string
>;

function renderSlideContent(slide: DeckSlide, index: number) {
	return slideRenderers[slide.layout](slide, createSlideFrame(slide), index);
}

function renderSlides(input: SlideDeckInput) {
	return input.slides
		.map(
			(slide, index) => `<section class="deck-slide layout-${slide.layout}" data-slide="${index}" aria-label="Slide ${index + 1}: ${escapeHtml(slide.title)}">
				<div class="slide-number">${String(index + 1).padStart(2, "0")}</div>
				${renderSlideContent(slide, index)}
			</section>`,
		)
		.join("\n");
}

function createSlideDeckHtml(input: SlideDeckInput) {
	return `<div class="deck-shell ${themeClasses[input.theme]}" data-deck data-animation="${input.animation}">
		<header class="deck-toolbar" aria-label="Presentation controls">
			<div class="deck-meta">
				<span>Slide deck</span>
				<strong>${escapeHtml(input.title)}</strong>
			</div>
			<div class="deck-actions">
				<button type="button" data-action="prev" aria-label="Previous slide">Back</button>
				<span class="deck-counter" data-counter>1 / ${input.slides.length}</span>
				<button type="button" data-action="next" aria-label="Next slide">Next</button>
				${input.showPrintButton ? `<button type="button" data-action="print" aria-label="Print or save as PDF">PDF</button>` : ""}
			</div>
		</header>
		<main class="deck-stage" tabindex="0" aria-live="polite">
			${renderSlides(input)}
		</main>
		<div class="deck-progress" aria-hidden="true"><span data-progress></span></div>
		<script type="application/json" data-deck-json>${escapeJsonForHtml(input)}</script>
	</div>`;
}

function createSlideDeckCss(input: SlideDeckInput) {
	const accent = normalizeAccentColor(input.accentColor);
	return `:root {
	--deck-accent: ${accent};
	--deck-ink: #111827;
	--deck-muted: #6b7280;
	--deck-border: #e5e7eb;
	--deck-surface: #ffffff;
	--deck-soft: #f8fafc;
	--deck-radius: 28px;
}

body { background: #f4f5f7; color: var(--deck-ink); }
.deck-shell { width: min(100%, 1180px); margin: 0 auto; padding: 18px; background: #f4f5f7; }
.deck-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.deck-meta { min-width: 0; display: grid; gap: 2px; }
.deck-meta span { font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--deck-muted); }
.deck-meta strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; letter-spacing: -.01em; }
.deck-actions { display: flex; align-items: center; gap: 8px; }
.deck-actions button { appearance: none; border: 1px solid var(--deck-border); border-radius: 999px; background: var(--deck-surface); color: var(--deck-ink); padding: 8px 12px; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; transition: border-color .18s ease, background .18s ease, transform .18s ease; }
.deck-actions button:hover { border-color: color-mix(in srgb, var(--deck-accent) 55%, var(--deck-border)); background: color-mix(in srgb, var(--deck-accent) 7%, var(--deck-surface)); }
.deck-actions button:active { transform: translateY(1px); }
.deck-counter { min-width: 54px; color: var(--deck-muted); font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
.deck-stage { position: relative; overflow: hidden; aspect-ratio: ${aspectRatioCss(input.aspectRatio)}; min-height: 420px; max-height: calc(100dvh - 112px); border: 1px solid var(--deck-border); border-radius: var(--deck-radius); background: var(--deck-surface); box-shadow: 0 18px 60px rgba(15, 23, 42, .08); }
.deck-slide { position: absolute; inset: 0; display: none; min-height: 100%; padding: clamp(36px, 6vw, 76px); background:
	radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--deck-accent) 11%, transparent), transparent 34%),
	linear-gradient(180deg, var(--deck-surface), color-mix(in srgb, var(--deck-soft) 70%, var(--deck-surface))); }
.deck-slide.is-active { display: flex; }
.slide-content { position: relative; z-index: 1; width: 100%; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
.slide-number { position: absolute; right: clamp(24px, 4vw, 48px); top: clamp(20px, 3vw, 40px); color: color-mix(in srgb, var(--deck-muted) 58%, transparent); font-size: 12px; font-weight: 750; letter-spacing: .16em; }
.slide-kicker { width: fit-content; margin: 0; border: 1px solid color-mix(in srgb, var(--deck-accent) 28%, var(--deck-border)); border-radius: 999px; padding: 7px 11px; color: color-mix(in srgb, var(--deck-accent) 72%, var(--deck-ink)); background: color-mix(in srgb, var(--deck-accent) 9%, transparent); font-size: clamp(11px, 1.4vw, 13px); font-weight: 760; letter-spacing: .16em; text-transform: uppercase; }
h1, h2 { max-width: 920px; margin: 0; color: var(--deck-ink); font-weight: 760; letter-spacing: -.055em; line-height: .96; }
h1 { font-size: clamp(52px, 8.3vw, 112px); }
h2 { font-size: clamp(42px, 6.3vw, 82px); }
h3 { margin: 0 0 14px; font-size: clamp(20px, 2.3vw, 30px); letter-spacing: -.035em; }
.slide-body { max-width: 760px; margin: 0; color: var(--deck-muted); font-size: clamp(18px, 2.25vw, 28px); line-height: 1.35; letter-spacing: -.02em; }
.slide-bullets { display: grid; gap: 13px; max-width: 780px; margin: 4px 0 0; padding: 0; list-style: none; }
.slide-bullets li { position: relative; padding-left: 26px; color: var(--deck-ink); font-size: clamp(18px, 2vw, 25px); line-height: 1.32; letter-spacing: -.02em; }
.slide-bullets li::before { content: ""; position: absolute; left: 0; top: .55em; width: 9px; height: 9px; border-radius: 999px; background: var(--deck-accent); }
.slide-bullets.compact { gap: 10px; }
.slide-bullets.compact li { font-size: clamp(15px, 1.55vw, 20px); }
.slide-bullets.centered { align-self: center; text-align: left; }
.fragment { opacity: 0; transform: translateY(12px); transition: opacity .32s ease, transform .32s ease; }
.deck-shell[data-animation="fade"] .fragment { transform: none; }
.deck-shell[data-animation="none"] .fragment,
.fragment.is-visible { opacity: 1; transform: none; }
.title-layout, .closing-layout { align-items: center; text-align: center; }
.title-layout .slide-kicker, .closing-layout .slide-kicker { align-self: center; }
.section-layout { max-width: 920px; }
.quote-layout { max-width: 940px; }
.quote-layout blockquote { margin: 0; color: var(--deck-ink); font-size: clamp(38px, 5.3vw, 76px); font-weight: 720; letter-spacing: -.055em; line-height: 1.02; }
.quote-attribution { margin: 0; color: var(--deck-muted); font-size: clamp(16px, 1.8vw, 22px); }
.two-column-grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, .85fr); gap: clamp(24px, 5vw, 62px); align-items: stretch; }
.secondary-panel, .metric-card, .slide-image { border: 1px solid var(--deck-border); border-radius: 24px; background: color-mix(in srgb, var(--deck-soft) 82%, var(--deck-surface)); }
.secondary-panel { padding: clamp(22px, 3vw, 34px); }
.metric-card { width: fit-content; min-width: min(100%, 280px); padding: 24px 28px; }
.metric-value { color: var(--deck-accent); font-size: clamp(42px, 6vw, 82px); font-weight: 780; letter-spacing: -.06em; line-height: .95; }
.metric-label { margin-top: 8px; color: var(--deck-muted); font-size: clamp(14px, 1.6vw, 18px); line-height: 1.35; }
.slide-image { overflow: hidden; margin: 0; min-height: 220px; }
.slide-image img { display: block; width: 100%; height: 100%; min-height: 220px; object-fit: cover; }
.slide-footer { position: absolute; left: clamp(28px, 5vw, 64px); right: clamp(28px, 5vw, 64px); bottom: clamp(20px, 3vw, 36px); margin: 0; color: color-mix(in srgb, var(--deck-muted) 78%, transparent); font-size: 12px; letter-spacing: .02em; }
.speaker-notes { display: none; }
.deck-progress { overflow: hidden; height: 3px; margin-top: 12px; border-radius: 999px; background: rgba(148, 163, 184, .25); }
.deck-progress span { display: block; width: 0%; height: 100%; border-radius: inherit; background: var(--deck-accent); transition: width .28s ease; }
.theme-midnight { --deck-ink: #eef2ff; --deck-muted: #a7b0c7; --deck-border: rgba(255,255,255,.14); --deck-surface: #101827; --deck-soft: #162033; }
.theme-midnight .deck-stage { box-shadow: 0 22px 70px rgba(2, 6, 23, .36); }
.theme-warm { --deck-ink: #24130f; --deck-muted: #7c6258; --deck-border: #eadbd4; --deck-surface: #fffaf7; --deck-soft: #f8efe9; }
.theme-minimal { --deck-accent: #111827; }
.theme-deodis { --deck-accent: ${accent}; }
@media (max-width: 760px) {
	.deck-shell { padding: 12px; }
	.deck-toolbar { align-items: stretch; flex-direction: column; }
	.deck-actions { justify-content: space-between; }
	.deck-stage { min-height: 520px; max-height: none; aspect-ratio: auto; }
	.deck-slide { padding: 34px 24px; }
	.two-column-grid { grid-template-columns: 1fr; }
}
@media print {
	@page { size: ${printPageSize(input.aspectRatio)}; margin: 0; }
	html, body { width: 100%; height: auto; margin: 0 !important; background: #fff !important; }
	.deck-shell { width: 100%; max-width: none; margin: 0; padding: 0; background: #fff; }
	.deck-toolbar, .deck-progress { display: none !important; }
	.deck-stage { display: block; width: 100vw; min-height: 0; max-height: none; height: auto; overflow: visible; border: 0; border-radius: 0; box-shadow: none; aspect-ratio: auto; }
	.deck-slide { position: relative; display: flex !important; width: 100vw; height: 100vh; min-height: 100vh; overflow: hidden; border: 0; border-radius: 0; page-break-after: always; break-after: page; }
	.deck-slide:last-child { page-break-after: auto; break-after: auto; }
	.fragment { opacity: 1 !important; transform: none !important; }
}`;
}

function createSlideDeckJs() {
	return `(function () {
	const root = document.querySelector('[data-deck]');
	if (!root) return;
	const slides = Array.from(root.querySelectorAll('[data-slide]'));
	const counter = root.querySelector('[data-counter]');
	const progress = root.querySelector('[data-progress]');
	const stage = root.querySelector('.deck-stage');
	const animation = root.getAttribute('data-animation') || 'rise';
	let slideIndex = 0;
	let fragmentIndex = animation === 'none' ? Number.POSITIVE_INFINITY : 0;

	function fragmentsFor(slide) {
		return Array.from(slide.querySelectorAll('[data-fragment]'));
	}

	function clampState() {
		slideIndex = Math.max(0, Math.min(slideIndex, slides.length - 1));
		const count = fragmentsFor(slides[slideIndex]).length;
		if (animation === 'none') {
			fragmentIndex = count;
		} else {
			fragmentIndex = Math.max(0, Math.min(fragmentIndex, count));
		}
	}

	function render() {
		clampState();
		slides.forEach((slide, index) => {
			const active = index === slideIndex;
			slide.classList.toggle('is-active', active);
			fragmentsFor(slide).forEach((fragment, fragmentPosition) => {
				fragment.classList.toggle('is-visible', !active || fragmentPosition < fragmentIndex || animation === 'none');
			});
		});
		if (counter) counter.textContent = (slideIndex + 1) + ' / ' + slides.length;
		if (progress) progress.style.width = slides.length <= 1 ? '100%' : String((slideIndex / (slides.length - 1)) * 100) + '%';
	}

	function next() {
		const fragments = fragmentsFor(slides[slideIndex]);
		if (animation !== 'none' && fragmentIndex < fragments.length) {
			fragmentIndex += 1;
		} else if (slideIndex < slides.length - 1) {
			slideIndex += 1;
			fragmentIndex = animation === 'none' ? Number.POSITIVE_INFINITY : 0;
		}
		render();
	}

	function previous() {
		if (animation !== 'none' && fragmentIndex > 0) {
			fragmentIndex -= 1;
		} else if (slideIndex > 0) {
			slideIndex -= 1;
			fragmentIndex = animation === 'none' ? Number.POSITIVE_INFINITY : fragmentsFor(slides[slideIndex]).length;
		}
		render();
	}

	root.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const action = target.closest('[data-action]');
		if (action) {
			const name = action.getAttribute('data-action');
			if (name === 'next') next();
			if (name === 'prev') previous();
			if (name === 'print') window.print();
			return;
		}
		if (target.closest('a, button')) return;
		next();
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
			event.preventDefault();
			next();
		}
		if (event.key === 'ArrowLeft' || event.key === 'PageUp' || event.key === 'Backspace') {
			event.preventDefault();
			previous();
		}
		if (event.key === 'Home') {
			slideIndex = 0;
			fragmentIndex = 0;
			render();
		}
		if (event.key === 'End') {
			slideIndex = slides.length - 1;
			fragmentIndex = fragmentsFor(slides[slideIndex]).length;
			render();
		}
	});

	stage && stage.focus({ preventScroll: true });
	render();
})();`;
}

export function createSlideDeckArtifact(input: SlideDeckInput) {
	return {
		kind: "html_artifact" as const,
		title: input.title,
		html: createSlideDeckHtml(input),
		css: createSlideDeckCss(input),
		js: createSlideDeckJs(),
		height: input.height,
		deck: input,
		exportNotes:
			"Use the PDF button or browser print dialog to export a static PDF. Click animations stay interactive in the HTML artifact; PDF viewers generally do not preserve JavaScript slide-step animations.",
	};
}
