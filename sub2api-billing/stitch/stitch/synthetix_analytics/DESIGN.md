---
name: Synthetix Analytics
colors:
  surface: '#0d1322'
  surface-dim: '#0d1322'
  surface-bright: '#33394a'
  surface-container-lowest: '#080e1d'
  surface-container-low: '#151b2b'
  surface-container: '#191f2f'
  surface-container-high: '#242a3a'
  surface-container-highest: '#2f3445'
  on-surface: '#dde2f8'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#dde2f8'
  inverse-on-surface: '#2a3040'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#ca8100'
  on-tertiary-container: '#3e2400'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0d1322'
  on-background: '#dde2f8'
  surface-variant: '#2f3445'
  surface-elevated: '#1E293BCC'
  gpt-blue: '#00A2FF'
  claude-emerald: '#059669'
  gemini-amber: '#D97706'
  other-indigo: '#6366F1'
  border-glow: '#334155'
  critical-red: '#EF4444'
  warning-yellow: '#FBBF24'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  kpi-value:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-margin: 24px
  gutter: 16px
  card-padding: 20px
  tight: 4px
---

## Brand & Style

The design system is a high-performance, enterprise-grade framework tailored for AI cost management and usage observability. It adopts a **Corporate / Modern** style infused with **Glassmorphism** and **Futuristic** accents to reflect the cutting-edge nature of the AI industry.

The brand personality is **Technical, Authoritative, and Proactive**. It evokes the feeling of a "Management Cockpit"—an environment where complex, high-velocity data is synthesized into clear, actionable intelligence. The aesthetic prioritizes data density and precision without sacrificing visual clarity, utilizing a dark-mode-first approach to reduce eye strain for power users while highlighting vibrant, functional status indicators.

**Key Visual Principles:**
- **Technical Precision:** Use of monospaced numerals and high-decimal precision.
- **Layered Intelligence:** Depth is used to separate high-level summaries from deep-dive technical logs.
- **Functional Vibrancy:** Saturated accent colors are reserved exclusively for data categories and status alerts to maintain high signal-to-noise ratios.

## Colors

The palette is optimized for a dark-mode-first experience, utilizing a deep navy base to provide maximum contrast for analytical data.

- **Primary (Electric Blue):** Used for primary actions, focus states, and the GPT model family.
- **Secondary (Emerald):** Used for success states, growth trends, and the Claude model family.
- **Tertiary (Amber):** Used for warnings, cost thresholds, and the Gemini model family.
- **Neutral (Deep Navy):** The core background foundation (`#0B1120`).

**Functional Color Logic:**
- **Budget Monitoring:** Usage < 80% is neutral; 80-95% utilizes `warning-yellow`; > 95% triggers `critical-red`.
- **Model Classification:** Specific hues are hard-coded to model families (GPT, Claude, Gemini) to ensure cross-platform visual consistency in charts and tables.
- **Translucency:** Surface containers should utilize 80% opacity (`#1E293BCC`) with a background blur (12px) to create depth.

## Typography

The typography system is designed for high information density and numerical clarity.

- **Headlines:** Use **Hanken Grotesk** for a modern, sharp executive feel.
- **Body & Interface:** **Inter** provides maximum legibility for dense tables and narrative insights.
- **Data & Numbers:** **JetBrains Mono** is mandatory for all monetary values, token counts, request IDs, and IP addresses. This ensures that columns of numbers align perfectly for easy visual scanning and comparison.

**Formatting Standards:**
- **Monetary Precision:** Display up to 6 fractional digits for granular cost analysis.
- **Percentages:** Round to 1 decimal place.
- **Hierarchy:** Primary identifiers (Usernames) use Semibold weights; secondary identifiers (Emails/IDs) use Regular weights in a smaller type size.

## Layout & Spacing

The system employs a **Fluid Grid** model based on an **8px base unit**, ensuring a rhythmic and predictable layout across all screen sizes.

- **Desktop (≥ 1280px):** 12-column grid with 16px gutters and 24px outer margins.
- **Tablet (768px - 1279px):** 6-column grid with collapsed side navigation into a hamburger menu.
- **Mobile (< 768px):** Single-column stack. Cards should have reduced horizontal padding (12px) to maximize content area.

**Layout Features:**
- **Drawer System:** A fixed-position right-side drawer ("Signal Center") for alerts and deep-dive details, occupying 400px on desktop and 100% width on mobile.
- **Information Density:** Use `tight` (4px) spacing for related data points (e.g., a label and its value) and `base` (8px) for separating logical groups within a card.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layering** and **Subtle Glows** rather than heavy shadows.

- **Level 0 (Base):** The core background color `#0B1120`.
- **Level 1 (Cards):** Surface color `#1E293B` with a subtle 1px border (`#334155`). On hover, the border color shifts to the `primary-color`.
- **Level 2 (Modals/Drawers):** Semi-transparent `#1E293BCC` with a 20px backdrop blur and a soft, low-opacity outer glow matching the primary or status color.
- **Layering Context:** 
    - Tables reside on Level 1.
    - Tooltips and context menus reside on Level 2.
    - Floating Signal Center drawer resides on Level 2.

## Shapes

The shape language is refined and consistent, balancing professional rigidity with modern approachability.

- **Cards & Containers:** 16px (`rounded-xl`) corner radius to create a distinct, modern containerized look.
- **Form Inputs & Buttons:** 8px (`rounded-lg`) corner radius for a more precise, tool-like appearance.
- **Badges & Tags:** Fully pill-shaped for easy distinction from interactive buttons.
- **Borders:** All container borders are thin (1px). Use subtle linear gradients on borders for "Hero" KPI cards to suggest a high-tech, premium feel.

## Components

### Buttons
- **Primary:** Solid `primary-color` with white text. High-contrast, no gradient.
- **Secondary/Ghost:** Border of `#334155` with a subtle background tint on hover.
- **Interactive States:** Use a brightness increase of 10% for hover states and a slight scale-down (0.98) for active clicks.

### Analytical Cards
- **Structure:** 20px padding, 16px rounded corners, 1px border.
- **Header:** Title in `label-sm`, with secondary actions (export/filter) in the top right.
- **Footer:** Use a subtle top border to separate "Narrative Insights" from the main chart area.

### Input Fields
- **Search:** Background `#0F172A`, 1px border, leading icon for search.
- **Date Picker:** High-density calendar view with `primary-color` for selected ranges.

### Data Tables
- **Header:** Sticky headers with a slightly darker background than the rows.
- **Rows:** Alternate row striping is discouraged; use subtle border-bottom lines instead to maintain the "cockpit" aesthetic.
- **Cell Content:** All numerical cells must use `data-mono`.

### Status Badges
- **Signal Badges:** Small circular dots next to text for "Signal Center" entries.
- **Budget Badges:** Solid background with high-contrast text for Critical/Warning/Normal statuses.