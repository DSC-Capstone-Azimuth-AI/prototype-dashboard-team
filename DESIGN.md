---
name: "DERCONNECT Unified Dashboard"
description: "Facilities Operations Console: calm, precise and approachable evidence review."
colors:
  primary: "#246649"
  primary-wash: "#eaf2ed"
  on-primary: "#fff"
  page: "#f3f6f3"
  surface: "#fff"
  surface-muted: "#eef3ef"
  surface-deep: "#e3ebe4"
  ink: "#17271f"
  ink-secondary: "#536359"
  muted: "#607067"
  border: "rgba(24, 51, 36, .12)"
  border-strong: "rgba(24, 51, 36, .22)"
  actual: "#2b2b29"
  expected: "#898781"
  forecast-outer: "rgba(137, 135, 129, 0.16)"
  forecast-inner: "rgba(137, 135, 129, 0.22)"
  history: "#c3c2b7"
  grid: "#e1e0d9"
  axis: "#c3c2b7"
  type-point: "#2a78d6"
  type-collective: "#eb6834"
  type-contextual: "#1baf7a"
  type-seasonal: "#eda100"
  type-peak: "#e87ba4"
  type-data: "#008300"
  severity-critical: "#d03b3b"
  severity-high: "#ec835a"
  severity-medium: "#fab219"
  severity-low: "#a8a69f"
  primary-dark: "#8ed4aa"
  primary-wash-dark: "#213d2c"
  on-primary-dark: "#13291c"
  page-dark: "#101a15"
  surface-dark: "#17241c"
  surface-muted-dark: "#1e2f24"
  surface-deep-dark: "#2c3e31"
  ink-dark: "#edf4ef"
  ink-secondary-dark: "#c0cdc3"
  muted-dark: "#a3b6a9"
  border-dark: "rgba(202, 227, 210, .14)"
  border-strong-dark: "rgba(202, 227, 210, .26)"
  actual-dark: "#e6e5e1"
  forecast-outer-dark: "rgba(195, 194, 183, 0.12)"
  forecast-inner-dark: "rgba(195, 194, 183, 0.18)"
  history-dark: "#52514e"
  grid-dark: "#2c2c2a"
  axis-dark: "#383835"
  type-point-dark: "#3987e5"
  type-collective-dark: "#d95926"
  type-contextual-dark: "#199e70"
  type-seasonal-dark: "#c98500"
  type-peak-dark: "#d55181"
  severity-low-dark: "#6f6d67"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "32px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline-mobile:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  title:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 620
    lineHeight: 1.45
  body:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.04em"
  eyebrow:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "10px"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "0.14em"
  metric:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "26px"
    fontWeight: 640
    lineHeight: 1.45
    letterSpacing: "-0.02em"
  mono:
    fontFamily: "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  small: "6px"
  control: "7px"
  inset: "8px"
  navigation: "9px"
  disclosure: "10px"
  card: "12px"
  pill: "999px"
spacing:
  inline: "8px"
  control-gap: "12px"
  compact: "14px"
  grid: "16px"
  card: "22px"
  section: "24px"
  gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  icon-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.inset}"
    padding: "6px 10px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
  navigation-current:
    backgroundColor: "{colors.primary-wash}"
    textColor: "{colors.primary}"
    rounded: "{rounded.navigation}"
    padding: "12px 10px"
  chip:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "1px 8px 1px 6px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  metric-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  disclosure:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.disclosure}"
    padding: "4px 18px"
  metric-strip:
    textColor: "{colors.ink}"
    padding: "12px 0px"
---

# Design System: DERCONNECT Unified Dashboard

## Overview

**Creative North Star: "Facilities Operations Console"**

The Facilities Operations Console is calm, precise and approachable. Operations Green identifies actions and the current location; Soft Stone surfaces separate controls, evidence and supporting context. Dense information stays readable through clear headings, whitespace, cards and disclosures.

Components are restrained and practical. Tonal layering and faint ambient shadows give the workspace enough depth to distinguish regions without competing with charts or event tables. The visual character is established by the current implementation, not a replacement identity.

Overview metrics use a compact divided strip. Event evidence uses open sections, with legends and explicit chart dates above plots. The mobile menu opens on request, and supporting detail follows the primary evidence.

This record captures the final CSS cascade and computed light/dark themes at the documented revision. Earlier blue shell declarations are superseded by green operational overrides; Signal Blue still belongs to the chart taxonomy. Implementation sources are `css/styles.css`, `index.html`, `js/ui.js`, `js/util.js`, `js/charts.js` and the section renderers.

**Key Characteristics:**

- Operations Green for actions and navigation; separate categorical and severity colors.
- System typography with compact labels, strong section headings and readable evidence.
- Soft Stone surfaces, gently rounded containers and faint ambient shadows.
- Persistent desktop navigation and a compact mobile menu.
- Tables, custom SVG charts and disclosures organize detailed evidence.

## Colors

Operations Green and Soft Stone form the shell; Signal Blue and the other categorical colors preserve the evidence vocabulary. Frontmatter contains the extracted canonical values. A `-dark` entry replaces its corresponding light entry in explicit dark mode; entries without a dark variant retain their value. Reuse the existing CSS variables instead of maintaining a second runtime palette.

### Primary

- **Operations Green** (`primary`, CSS `--accent`): primary actions, links, the brand mark, section eyebrows, focus and current navigation. Its dark counterpart is a pale mint green with a dark on-accent foreground.
- **Operations Wash** (`primary-wash`): current navigation, selected rows and compact metric-icon backgrounds. It identifies state without repainting entire evidence cards.
- **On Operations Green** (`on-primary`): primary-button text and the lightning mark's contrast color.

### Neutral

- **Soft Stone** (`page`, `surface-muted`, `surface-deep`): pale green-tinted page and nested surfaces, with forest-tinted dark counterparts. `surface` is the main card, control and navigation material.
- **Forest Ink** (`ink`, `ink-secondary`, `muted`): primary reading, supporting labels and secondary context. Dark mode reverses the luminance hierarchy while preserving the green cast.
- **Quiet Boundaries** (`border`, `border-strong`): faint container edges and stronger interactive-field boundaries. Grid and axis colors remain their separate chart roles.
- **Measured Ink / Expected Gray** (`actual`, `expected`): neutral observed and forecast lines. `forecast-outer` and `forecast-inner` provide translucent nominal uncertainty bands; `history` recedes behind current evidence.

### Evidence palettes

These are semantic encodings, not extra brand accents. The type order in `js/util.js` is fixed:

| Type | Token | Required symbol |
|---|---|---|
| Point | `type-point` — Signal Blue | Circle ● |
| Collective | `type-collective` | Square ■ |
| Contextual | `type-contextual` | Diamond ◆ |
| Seasonal / pattern | `type-seasonal` | Triangle ▲ |
| Peak demand | `type-peak` | Star ★ |
| Data integrity | `type-data` | Cross ✕ |

Critical, High, Medium and Low use the `severity-*` tokens with their existing icon and label. Review status is a separate neutral/state treatment. Sequential heatmaps retain the source stylesheet's seven-step blue scale; diverging charts retain their blue–neutral–red scale. Do not substitute the shell accent for these scales.

**The Evidence Color Rule.** Preserve the separate meanings of action color, anomaly type, severity, measurement quality and review status; never use one as a substitute for another.

The sidecar's generated eight-step OKLCH ramps are preview aids, not additional approved application colors. Their canonical swatches come from the code; their intermediate tones are synthesized for the design panel.

## Typography

**Body and heading font:** the operating system's sans-serif stack recorded in frontmatter. There is no distinct display face or downloaded webfont. **Identifier font:** the existing system monospace stack.

The hierarchy is compact and utilitarian rather than a strict ratio scale. Strong section titles establish location; small uppercase filter labels and spaced eyebrows establish grouping. Identifiers and aligned numeric tables support close comparison.

- **Headline:** desktop section heading; use `headline`, switching to `headline-mobile` at the mobile shell breakpoint. Supporting section copy uses body size with a more open line height (1.65) and a maximum measure (85ch).
- **Title:** card headings use `title`; building-card headings are larger (18px), and event detail titles use their established detail size (26px).
- **Body:** use `body` for controls and prose. Secondary notes commonly step down (12–13px).
- **Label:** use `label` for uppercase filter captions. Use `eyebrow` for smaller, more widely spaced section context.
- **Metric:** use `metric` for standard desktop KPI values; mobile values reduce (21px). The existing optional hero KPI increases its figure (40px, line height 1.1).
- **Monospace:** use `mono` for event/meter identifiers and technical evidence. Numeric table cells and chart labels use tabular numerals where already specified.

**The Type Continuity Rule.** Extend the system-font hierarchy; do not introduce a decorative display face for routine console screens.

## Layout

Desktop uses a fixed left navigation rail (232px), with matching body offset. The rail has generous internal top spacing (30px) and narrow horizontal padding (18px). The main workspace is centered within its remaining space, capped (1480px), with desktop padding (26px 32px 48px). The filter band sits in normal flow above it; the earlier sticky-filter declaration is overridden.

Evidence panels use a twelve-column grid with mixed spans and a compact gap (14px). The KPI row uses four columns with a larger gap (16px); the building directory uses three columns. At the evidence breakpoint (1100px and below), broad spans become full-width, KPIs and summary facts become two columns, and the directory becomes two columns.

At the mobile shell breakpoint (700px and below), remove the body offset and use a compact sticky header (65px in the checked views). Its Menu button opens a scrollable navigation disclosure; Escape returns focus to the button, and route selection closes the menu. All destinations remain native links. Hide navigation subtitles and the brand tagline. Main padding becomes compact (16px 16px 20px), cards use mobile padding (14px), and the building directory becomes one column. Summary metrics use two columns. Controls wrap; keep evidence tables horizontally scrollable within their own container, with the recent-event Action column retained at the right edge.

The smaller chart/filter breakpoint (640px and below) stacks remaining narrow spans and allows filter fields to fill available width. Event interpretation uses two columns when space permits, and one column through the intermediate breakpoint (1150px and below). These are overlapping component breakpoints, not one universal device scale.

The spacing entries record recurring observed values, not an existing mathematical spacing-token scale. Preserve their relationships rather than forcing every interval into a new scale.

## Elevation & Depth

Tonal layering carries most hierarchy. Main cards use faint ambient shadows and fine borders; nested review and explanatory regions use a deeper neutral surface. Stronger shadows belong to floating tooltips and the existing building-card hover response, rather than every container.

The sidecar records the exact light/dark ambient shadows, tooltip shadow and building-hover shadow. Keep hover elevation local to the interactive container. Focus is a visible outline (2px, offset 2px); linked metric cards use their existing wider offset (3px).

**The Quiet Depth Rule.** Keep card shadows ambient; use boundaries and surface tones to separate routine evidence.

## Shapes

Gently rounded rectangles define the console. Main cards use `rounded.card`, disclosures use `rounded.disclosure`, navigation uses `rounded.navigation`, and fields/buttons use `rounded.control`. Nested facts and notes use `rounded.inset`; small utility forms use `rounded.small`. Pills are reserved for compact category/status labels. The brand uses the existing rounded lightning-mark container and inline SVG artwork.

Most boundaries are single-pixel strokes. Building directory cards retain a stronger accent top edge (3px); current navigation carries an accent inset edge (3px). Keep these functional markers distinct from severity dots and anomaly symbols.

## Components

### Buttons

Restrained and practical. Primary actions use Operations Green with the on-accent foreground; secondary buttons use the main surface and stronger border. Both retain control rounding, compact padding and an observed minimum height (36px). Secondary hover shifts to the muted surface; primary hover uses a subtle brightness change (.94). Pressed state adds an inset boundary (2px). Theme/icon buttons use a slightly rounder shape and icon/text pairing. Native disabled behavior is not a separately defined visual token.

Segmented choices share a stronger outlined container and control rounding. Their selected button uses inverse ink/surface colors, not the primary-action accent. Regular segments use compact text (12px), padding (4px 10px) and a minimum height (32px); Buildings controls have their own larger padding (8px 12px). Preserve `aria-pressed` and the existing mobile wrapping.

### Inputs / Fields

Familiar native controls use surface fill, stronger boundary and compact control rounding. Filter fields pair with an uppercase caption and shared focus outline; selects have the observed minimum height (36px), while text/date inputs follow their native box metrics and padding. Search uses larger internal spacing (10px 14px) and an established width cap (380px). Review textareas use a smaller radius (6px), padding (12px) and vertical resizing. Errors and unavailable states use existing explanatory text rather than an invented validation-color system.

### Navigation

The desktop rail pairs inline outline SVG icons with a name and small subtitle. At 1440px and wider, concise links sit under Monitor & investigate and Data & tools; redundant subtitles yield to the group labels. Historical Monitoring belongs with the operational destinations. Current location uses accent text, wash and a left inset stripe. When the animated indicator is ready it owns the moving background/boundary; preserve the static selected treatment as its fallback. Mobile exposes the same links through a Menu disclosure with `aria-expanded` and `aria-controls`; current location uses accent wash. Maintain native links, `aria-current` and visible keyboard focus. The menu is nonmodal and closes on Escape, route selection or outside click.

### Chips / Review Status

Type chips are compact outlined pills with a fixed colored symbol and a readable label. Severity pairs its small colored marker with the existing icon and text. Neutral review-status pills remain semantically separate; preserve the actual source-specific status vocabulary and existing state treatments rather than assigning severity colors to review progress.

### Cards / Metric Cards

Cards group one coherent evidence region with a title, optional subtitle/tools, body and optional footnote. Use the ambient shadow and fine border. Headers allow tools to wrap; at mobile sizes the tools stop relying on an automatic left margin. Linked metric cards preserve the label, compact accent icon, value and context; their hover changes the boundary to accent and keyboard focus remains explicit.

Overview and saved-window metrics use a divided strip rather than separate cards. Overview icons yield to labels and values; linked metrics retain focus and hover feedback. Event detail uses an open surface with compact facts, a chart and supporting disclosures. Review jumps scroll to and focus the corresponding operator-review region. Original calculations and source-specific review semantics remain intact.

At desktop widths of 1440px and wider, Overview worklists and primary model evidence use open sections without an enclosing card border, radius or shadow. Candidate volume leads the operational metric strip; the worklist exposes saved local review status and progress. Supporting context stays secondary. Page headings use a 28px desktop variant with -0.025em tracking. The incumbent narrower layouts retain their existing structure.

### Desktop Directory Comparison

Buildings and real meters use native comparison tables at 1440px and wider; the existing cards remain the narrower-screen presentation. Column headings carry repeated labels once. Real rows compare candidate counts, scored hours, loaded record dates, measurement/interpolation availability, saved review progress and optional phase availability. Loaded record dates include calibration and must not be labeled analyzed coverage. Phase-only rows explicitly lack connected model evidence. Review progress reads persisted records, excludes drafts and reports unreadable statuses as unavailable. Synthetic building rows retain explicitly simulated relationships and separate local annotations. Use Synthetic Demo consistently for this source.

Use thin row dividers, existing table colors, right-sized text and tabular numerals. Keep model descriptions in one caption or toolbar, rather than repeating them per meter. Search and profile links retain the same route/state contracts; the directory does not create verified building identities or feeder mappings.

### Disclosures

Native details/summary structures hold additional evidence and help. Keep the accent disclosure marker, compact summary and open-state spacing. Keyboard focus on the summary also highlights the disclosure boundary. Disclosure contents enter briefly with a small fade/translation (180ms); reduced-motion preference disables it.

### Event Tables and SVG Evidence

Tables use sticky, muted-surface column headers, thin row dividers, hover tone and selected wash. Numeric columns align right; labels and identifiers stay readable. Contain vertical scrolling (420px standard, 560px tall) and horizontal overflow inside the table wrapper. Narrow real-event tables keep their existing sticky Action column.

Custom SVG charts use neutral solid measured lines, dashed expected lines and layered uncertainty bands. Point anomalies use markers; sustained intervals use shading. Preserve fixed anomaly symbols, labeled legends, units, axis text and gap behavior. Existing tooltips use a compact elevated surface, small text and tabular numeric values; do not replace chart evidence with decorative illustrations.

Real Chronos-2 charts retain their existing blue dashed median expectation. Overview offers 7-day, 30-day and full-selected-range inspection without changing headline metrics or candidate filters. Legends and exact chart ranges precede plots. Calendar names render only when the shaded interval has room; hover context retains the full information. A focused event plot is explicitly separate from saved-window metrics, which sit in a disclosure until the saved chart range is restored. Empty analyzed scopes lead with a visible explanation and recovery action.

Noncompact tooltip-enabled time series expose a native Inspect chart values disclosure with a keyboard range control, Previous/Next and a live selected-position readout. Hourly model plots call this Inspect hourly values. Arrow keys move one hour; Home/End reach the displayed boundaries. Real readouts preserve supplied numeric precision for power, raw scores and thresholds, distinguish measured/interpolated/unavailable observations, retain missing UTC gaps and link matching candidate events. Linked comparison charts retain their existing synchronized keyboard inspector. Synthetic scores remain rounded/capped export ratios, never reconstructed raw decisions.

A meter profile focused on an event uses its primary context plot and one retained selected-event summary. Open event review sits beside the focus/return controls; after returning to the saved range, it sits in the selected summary. A secondary context chart remains available only when the primary plot has returned to the saved range. Saved chart dates and event/list filters remain distinct.

### Motion and Focus

Routine state feedback uses the existing fast transition (160ms, ease). Navigation's indicator moves with its existing timing (320ms), while workspace entry uses the existing short fade/vertical motion (260ms) and exit is shorter (120ms). Disclosures use their own entry timing; tooltips use a short opacity transition (80ms). These are distinct existing behaviors, not a single global animation duration. Preserve `prefers-reduced-motion`, skip navigation and native focus behavior. Accessibility conformance remains unverified by this documentation task.

## Do's and Don'ts

### Do:

- Do use existing theme variables and the final CSS cascade when extending the interface.
- Do pair anomaly colors with their fixed symbols and severity colors with icons and labels.
- Do keep measured demand solid, expected demand dashed and forecast bands visually subordinate.
- Do retain keyboard focus, native links and controls, reduced-motion handling and local table scrolling.
- Do use section headings, concise summaries and disclosures to organize dense evidence.

### Don't:

- Don't reuse severity colors as decoration or treat review-status pills as severity indicators.
- Don't restore the superseded blue shell palette or the old horizontal desktop tab strip by copying early CSS declarations.
- Don't introduce external display fonts, ornamental imagery or exaggerated elevation into the existing console.
- Don't encode data distinctions with color alone or infer a confirmed diagnosis from a visual highlight.
- Don't claim an accessibility certification or responsive behavior beyond the checks actually performed.
