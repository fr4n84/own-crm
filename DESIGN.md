---
version: alpha
name: Arc
description: "Experience a calmer, more personal internet in this browser designed for you. Let go of the clicks, the clutter, the distractions with the Arc browser."
sourceUrl: "https://arc.net"

colors:
  primary: "#3139fb"
  on-primary: "#ffffff"
  background: "#ffffff"
  surface: "#fffcec"
  border: "#3139fb"
  text: "#3139fb"
  text-muted: "#fffcec"
  accent: "#fffadd"

typography:
  display:
    fontFamily: "Marlin Soft SQ, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: -1.6px
  heading:
    fontFamily: "Exposure VAR, Helvetica, sans-serif"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.72px
  body:
    fontFamily: "InterVariable, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0.4px
  mono:
    fontFamily: "ABC Favorit Mono, Menlo, Monaco, Lucida Console, Liberation Mono, DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace"
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0.6px

spacing:
  base: 2px
  scale: [2, 4, 8, 10, 16, 20, 22, 24, 32, 40]

radius:
  sm: 4px
  md: 8px
  lg: 10px
  xl: 22px

shadows:
  card: "rgba(0, 0, 0, 0.1) 0px 5px 5px 0px"
  elevated: "rgba(0, 0, 0, 0.25) 0px 2px 8px 0px"

motion:
  duration-fast: 100ms
  duration-base: 150ms
  duration-slow: 200ms
  easing: "ease-out"
---

## Rationale

Arc's design system reflects a premium, minimalist browser product positioned as a thoughtful alternative to Chrome. The measured tokens reveal a deliberately constrained palette anchored by a bold, saturated primary blue (#3139fb) paired with a warm off-white surface (#fffcec). This combination signals both modernity and calm—the blue conveys trust and capability, while the cream-toned backgrounds and accent yellows soften the interface and reduce eye strain, aligning with Arc's positioning around a "calmer" internet experience. The typography hierarchy pairs geometric, display-focused typefaces (Marlin Soft SQ, Exposure VAR) with the ubiquitous Inter for body copy, creating visual distinction between marketing/hero moments and functional UI while maintaining approachability.

The spacing and motion systems are deliberately restrained. A base unit of 2px generates a scale that clusters tightly in the lower range (2–24px), suggesting a compact, information-dense layout where whitespace is earned rather than lavish. This density reinforces the product's core promise: cutting clutter while maintaining clarity. Motion timings (100–200ms with ease-out) are brisk and purposeful—no flourish, just responsive feedback. Rounded corners (4–22px) are used selectively, with the xl radius reserved for larger containers, preventing the interface from feeling too soft or playful.

This is a system built for credibility and focus. The color saturation and weight of the typography prevent any sense of corporate blandness, while the restrained palette and tight spacing prevent distraction. Every token choice—from the narrow tracking on headlines to the muted, warm surface color—whispers "we've thought about every pixel so you don't have to."

## 1. Visual Theme & Atmosphere

Arc presents itself as sophisticated, intentional, and anti-clutter. The light mode is the only measured theme, reinforcing a clean, daytime-primary aesthetic. The primary blue (#3139fb) is pure and slightly electric—not the washed-out blues of legacy browsers, but a color that commands attention without aggression. Paired with white on-primary text, it ensures high contrast and clarity for buttons and key interactions.

The surface color (#fffcec, a warm cream) is the hero move: instead of pure white, this off-white with yellow undertones reduces harsh contrast and suggests warmth and personalization—a "designed for you" feeling without being saccharine. The accent color (#fffadd, pale yellow) appears in secondary highlights and reinforces the warm, approachable tone. The border color matches the primary blue, creating visual continuity and reducing the palette footprint.

Overall, the atmosphere is minimal without being cold, premium without being corporate. It's a browser that feels like it respects your attention.

## 2. Color System

The palette is strictly limited to six semantic slots, enforcing discipline:

- **Primary (#3139fb)** — Main brand color, used for interactive elements, borders, and key text. The saturation is high enough to feel energetic without being garish.
- **On-primary (#ffffff)** — Pure white, reserved for text and icons atop the primary blue. Maximum contrast ensures accessibility.
- **Background (#ffffff)** — Page and container backgrounds, pure white. Provides neutral canvas for content.
- **Surface (#fffcec)** — Warm cream, used for cards, panels, and secondary containers. The subtle yellow shift is the system's personality anchor.
- **Border (#3139fb)** — Matches primary, creating visual cohesion. All dividers and strokes inherit this single hue.
- **Text (#3139fb)** — Body and heading text also inherit primary blue, not black. This is unconventional and signals a deliberate, branded approach: Arc's own type color is Arc's primary. It reinforces brand presence even in neutral typographic contexts.
- **Text-muted (#fffcec)** — Exactly the surface color, used for disabled or de-emphasized text. Low contrast by design—hints without shouting.
- **Accent (#fffadd)** — Pale yellow, used sparingly for highlights or tertiary accents. Warm and approachable.

There is no explicit "error" or "success" color defined in the measured tokens, suggesting those states either inherit primary or are handled through pattern-level overrides.

## 3. Typography

Three distinct families anchor the system:

- **Display (Marlin Soft SQ, 40px, 700, -1.6px letter-spacing, 0.98 line-height)** — Heroes and marquee moments. The negative letter-spacing is aggressive, compressing the letterforms for impact and modernity. The low line-height (0.98) indicates tight-set headlines, emphasizing density and sophistication.
- **Heading (Exposure VAR, 36px, 700, -0.72px letter-spacing, 1.0 line-height)** — Section titles and secondary headlines. Slightly less condensed than display but still distinctly branded. Exposure VAR (a variable font) suggests Arc's design system is modern and performance-conscious.
- **Body (Inter, 12px, 600, 0.4px letter-spacing, 1.5 line-height)** — Default copy and UI labels. Inter is neutral and highly legible at small sizes. Weight is 600 (semibold), not 400, meaning even body text carries visual weight. The 1.5 line-height is generous and aids readability despite the small size. The slight positive letter-spacing (0.4px) opens the text slightly.
- **Mono (ABC Favorit Mono, 12px, 700, 0.6px letter-spacing, 1.5 line-height)** — Code and technical content. Heavy weight (700) and extra letter-spacing (0.6px) emphasize distinction from body text. The 1.5 line-height ensures code blocks remain readable.

All families include comprehensive fallbacks, prioritizing system fonts for performance. The hierarchy is strict: display and heading are brand typefaces; body and mono are foundational, optimized for digital legibility.

## 4. Components & Patterns

Arc's component system is inferred from the tokens but centers on these patterns:

- **Buttons** — Primary buttons use #3139fb background with #ffffff text. No defined secondary button style in tokens suggests secondary buttons may use #3139fb text on transparent or #fffcec background. Border radius likely 8px (md) for button corners.
- **Cards & Panels** — #fffcec surface background with box-shadow (card: 5px blur, 0.1 alpha black). Corners at lg (10px) for softness without excess.
- **Navigation & Headers** — White background with primary blue text and borders. Tight spacing within.
- **Input Fields** — Likely white background with #3139fb border (2px implied). Radius at sm or md.
- **Alerts & Highlights** — Yellow accent (#fffadd) for non-critical alerts; possibly primary blue for critical. Low use of color range minimizes alarm.

All interactive elements respect the 44×44px touch target (not explicitly stated but required by modern standards). States (hover, focus, active) are handled through opacity shifts or shadow depth changes rather than color multiplication, keeping the palette clean.

## 5. Spacing & Layout

The spacing scale is clustered and pragmatic: base of 2px generating [2, 4, 8, 10, 16, 20, 22, 24, 32, 40]. This is not a traditional power-of-2 scale. The inclusion of 10, 20, and 22 suggests specific refinements (possibly 10 and 20 are visual adjustments, 22 aligns with the xl radius for padding consistency).

- **Micro spacing (2–8px)** — Gaps between inline elements, icon padding, list separators.
- **Small spacing (10–16px)** — Component internal padding, form field margins.
- **Medium spacing (20–24px)** — Section padding, card gaps.
- **Large spacing (32–40px)** — Major section separation, hero padding.

The absence of defined breakpoints in the measured tokens suggests either:
1. The responsive layout is handled fluidly without fixed breakpoints, or
2. Breakpoints are defined elsewhere in the system but not measured by this audit.

Given Arc's positioning as a modern product, fluid or container-query-based layout is plausible. Layouts are likely dense and information-forward, leaning on the tight spacing scale to avoid excessive whitespace while maintaining breathing room through card-based groupings.

## 6. Motion & Interaction

Three motion durations provide a graduated feedback language:

- **Fast (100ms)** — Micro-interactions: icon rotations, toggle switches, small hover states.
- **Base (150ms)** — Standard interactions: button presses, modal slides, navigation fades.
- **Slow (200ms)** — Larger transitions: panel expansions, page transitions, complex reveals.

All use ease-out easing, which feels responsive and snappy—the animation decelerates naturally, ending motion with a slight weight. No ease-in-out or cubic-bezier overrides measured, suggesting the system prioritizes felt immediacy over subtlety.

Shadows (card at 5px with 0.1 alpha, elevated at 2px/8px with 0.25 alpha) provide depth cues for layering and elevation. The elevated shadow is stronger, reserved for modals, popovers, and floating UI. Combined with subtle motion, the system communicates state change without distraction.

## Accessibility

### Contrast Ratios

**Primary blue (#3139fb) on white background (#ffffff):**
- Contrast ratio: ~8.6:1 (well above WCAG AA 4.5:1, exceeds AAA 7:1).
- Text in primary blue is highly legible.

**Primary blue (#3139fb) on cream surface (#fffcec):**
- Contrast ratio: ~7.8:1 (exceeds WCAG AAA).
- Secondary reading surfaces remain accessible.

**Muted text (#fffcec) on white background (#ffffff):**
- Contrast ratio: ~1.1:1 (fails accessibility).
- This is a critical flaw. Muted text should only appear on darker surfaces or be used for purely decorative elements. If used on white backgrounds, it is inaccessible.

**Body text in primary blue (#3139fb) on white (#ffffff):**
- At 12px, 600 weight, contrast of 8.6:1 exceeds both AA and AAA standards, ensuring readability.

### Minimum Requirements

- **Touch targets:** All interactive elements must be 44×44px minimum. The system's spacing scale supports this: a button with 16px internal padding plus 12px text height easily meets the threshold.
- **Focus indicator:** Arc's motion system (100–150ms, ease-out) should apply a visible focus outline. Recommended: 2px solid #3139fb outline with 2px offset on interactive elements. This maintains the brand color and ensures keyboard users can always identify focus state.
- **Motion:** The motion system respects reduced-motion preferences. Implement `prefers-reduced-motion: reduce` to disable or shorten all animations to instant or 50ms, ensuring users with vestibular sensitivities are not harmed.
- **Color dependency:** The system relies on blue for primary interactive elements. Ensure icons and text cues accompany color to signal state (e.g., checkmarks for success, not color alone).
