# ByPlan Design System

## 1. Visual Theme & Atmosphere

ByPlan is a premium interior planning studio. The design language communicates warmth, trust, and craftsmanship — it should feel like quality paper, soft light, and a designer's mood board, not a tech startup. The entire UI is built on a glassmorphism foundation: semi-transparent surfaces with backdrop blur over a warm lavender-beige background, creating physical depth as if UI elements are frosted glass panels laid on a warm surface.

The palette centers on a distinctive warm lavender-beige (`#EDE8EC`) — not cold gray, not sterile white. This pink-undertone neutral creates an instantly recognizable atmosphere. The brand accent is a warm cognac brown (`#6E4C3D`) used sparingly for emphasis and trust signals. Primary actions use near-black (`#1C1B1B`), keeping the UI grounded and professional.

Typography relies on **Manrope** (a geometric humanist sans-serif) for all body and heading text, with **Bodoni Moda** (a high-contrast modern serif) reserved exclusively for the logo mark. Headlines use heavy weight (800) with tight letter-spacing (-0.02em), creating dense, confident headings. Body text is set at a comfortable 1.55 line-height for readability.

The glassmorphism vocabulary: every surface (cards, badges, buttons, modals) uses a consistent formula of `rgba(255,255,255, opacity)` background + `backdrop-filter: blur(10px)` + `1px solid` whisper border + `inset 0 1px 0 rgba(255,255,255, highlight)` top edge. This creates a layered, three-dimensional feel without heavy drop shadows.

**Key Characteristics:**
- Warm lavender-beige background (`#EDE8EC`) — the signature color
- Glassmorphism on all surfaces: translucent white + backdrop blur + whisper borders
- Cognac brown (`#6E4C3D`) brand accent — warm, trustworthy, premium
- Near-black (`#1C1B1B`) for text and primary actions
- Manrope 800 headings with -0.02em letter-spacing
- Pill-shaped buttons and badges (999px border-radius)
- Generous border-radius (24px standard, 16px small, 999px pill)
- Multi-layer volumetric depth via overlays, gradients, and grain textures

## 2. Color Palette & Roles

### Background Surface
- **Primary Background** (`#EDE8EC` / rgb `237, 232, 236`): Page background. Warm lavender-beige with subtle pink undertone. This is the signature color.
- **Glass White** (`rgba(255,255,255, var)` / `--glass-rgb: 255, 255, 255`): Used at varying opacities for surface fills.
- **Section Alt** (`#F4F0F3`): Lighter variant for alternating section backgrounds (e.g., #for, #process).

### Text
- **Primary Text** (`#1C1B1B`): Near-black with warm undertone. All headings and body text.
- **Muted Text** (`rgba(28,27,27, 0.70)`): Secondary text, descriptions, captions.
- **Subtle Text** (`rgba(28,27,27, 0.55)`): Footer metadata, version numbers, timestamps.

### Brand & Accent
- **Brand Cognac** (`#6E4C3D`): Logo color, brand emphasis, icon tints, accent borders. Use sparingly — it's the premium touch.
- **Brand Deep** (`#4F352B`): Darker variant for strong emphasis (stat numbers, highlighted metrics).
- **Brand Soft** (`rgba(110,76,61, 0.18)`): Tinted backgrounds for brand-accented elements.

### Interactive
- **Primary Action** (`#1C1B1B`): Black pill button for main CTAs. Text: `#ffffff`.
- **Secondary Action** (`rgba(255,255,255, 0.30)`): Glass button with whisper border.
- **Focus Ring** (`rgba(110,76,61, 0.35)`): Focus-visible outline using brand color.

### Surface & Border
- **Card Fill** (`rgba(255,255,255, 0.55)`): Standard card background (glass).
- **Card Fill Strong** (`rgba(255,255,255, 0.72)`): Featured/highlighted cards.
- **Card Fill Light** (`rgba(255,255,255, 0.35)`): Subtle backgrounds (badges, pills).
- **Card Fill Dense** (`rgba(255,255,255, 0.86)`): Form cards, modals, dense content.
- **Border Standard** (`rgba(0,0,0, 0.08)`): Default card and divider borders.
- **Border Medium** (`rgba(0,0,0, 0.12)`): Buttons, interactive element borders.
- **Border Strong** (`rgba(0,0,0, 0.14)`): Hover state, emphasized borders.
- **Border Brand** (`rgba(110,76,61, 0.28)`): Brand-accented card borders (featured pricing, key metrics).

### Shadows & Depth
- **Shadow Soft** (`0 14px 38px rgba(0,0,0, 0.16)`): Standard card elevation.
- **Shadow Medium** (`0 22px 58px rgba(0,0,0, 0.18)`): Featured cards, prominent elements.
- **Shadow Button** (`0 18px 45px rgba(0,0,0, 0.22)`): Primary CTA button depth.
- **Shadow Hero** (`0 34px 95px rgba(0,0,0, 0.52)`): Hero section card — maximum depth.
- **Elevation 1** (`0 10px 24px rgba(0,0,0, 0.10)`): Subtle lift (hover base).
- **Elevation 2** (`0 18px 40px rgba(0,0,0, 0.14)`): Hover state elevation.
- **Elevation 3** (`0 34px 95px rgba(0,0,0, 0.28)`): Modal/lightbox elevation.

### Glass Effect (standard formula)
```css
background: rgba(255,255,255, [opacity]);
border: 1px solid rgba(0,0,0, 0.08);
border-radius: var(--radius);
-webkit-backdrop-filter: blur(10px);
backdrop-filter: blur(10px);
box-shadow: inset 0 1px 0 rgba(255,255,255, 0.28);
```

## 3. Typography Rules

### Font Family
- **Primary**: `"Manrope", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`
- **Logo/Accent**: `"Bodoni Moda", "Playfair Display", Georgia, serif` — ONLY for the logo wordmark, never for headings or body.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Hero Headline | Manrope | clamp(2.35rem, 4.2vw, 3.75rem) | 800 | 1.05 | -0.02em | Maximum impact, responsive scaling |
| Section Heading | Manrope | clamp(1.55rem, 2.4vw, 2.15rem) | 800 | 1.15 | -0.01em | Section titles |
| Card Title | Manrope | 1.08rem | 850 | 1.3 | -0.01em | Card headings, step titles |
| Body Large | Manrope | 1.05rem | 600 | 1.55 | normal | Lead text, intros (.lead class) |
| Body | Manrope | 1rem (16px) | 400 | 1.55 | normal | Standard reading text |
| Body Strong | Manrope | 1rem | 650 | 1.55 | normal | Buttons, emphasized inline text |
| Stat Number | Manrope | clamp(1.35rem, 2.2vw, 2rem) | 900 | 1.08 | -0.02em | Large metric numbers, tabular-nums |
| Caption | Manrope | 0.95rem | 600 | 1.35 | normal | Badge text, card meta, contact labels |
| Small | Manrope | 0.85rem | 400 | 1.45 | normal | Footer text, legal, fine print |
| Logo | Bodoni Moda | clamp(2.2rem, 4.6vw, 3.55rem) | 600 | 1 | 0.02em | Logo wordmark only |

### Principles
- **Weight signals hierarchy**: 800-900 for headings (announce), 600-650 for interactive/emphasis, 400 for reading.
- **Tight headings, open body**: Letter-spacing is -0.02em for h1, -0.01em for h2/h3, normal for body. Line-height is 1.05-1.15 for headings, 1.55 for body.
- **No serif headings**: Bodoni Moda is ONLY for the logo. All content headings use Manrope.
- **Responsive headings**: Use `clamp()` for h1 and h2 to scale smoothly between mobile and desktop.

## 4. Component Stylings

### Buttons

**Primary (Black Pill)**
- Background: `#1C1B1B`
- Text: `#ffffff`
- Padding: 14px 22px
- Border-radius: 999px (pill)
- Border: 1px solid transparent
- Shadow: `0 18px 45px rgba(0,0,0, 0.22)`
- Hover: translateY(-1px), shadow intensifies
- Active: translateY(0), shadow reduces
- Use: Main CTA ("Заполнить анкету", "Заказать")

**Secondary (Glass Pill)**
- Background: `rgba(255,255,255, 0.26)`
- Text: `rgba(28,27,27, 0.9)`
- Padding: 14px 22px
- Border-radius: 999px
- Border: `1px solid rgba(0,0,0, 0.14)`
- Backdrop-filter: blur(10px)
- Shadow: `inset 0 1px 0 rgba(255,255,255, 0.35)`
- Hover: translateY(-1px), elevation increases
- Use: Secondary actions ("Смотреть тарифы", "Подробнее")

**Ghost (Text + Border)**
- Background: transparent
- Text: `rgba(28,27,27, 0.86)`
- Border: `1px solid rgba(0,0,0, 0.12)`
- Border-radius: 999px
- Use: Tertiary actions, toggles, bio expand button

**All buttons**: font-weight 650, transition 160ms cubic-bezier(.2,.8,.2,1).

### Cards & Containers

**Standard Card**
- Background: `rgba(255,255,255, 0.55)`
- Border: `1px solid rgba(0,0,0, 0.08)`
- Border-radius: 24px
- Shadow: `0 14px 38px rgba(0,0,0, 0.16)`
- Padding: 16px
- Hover: translateY(-3px), shadow to Elevation 2, border-color to 0.12

**Featured Card** (pricing highlight, key metrics)
- Background: `rgba(255,255,255, 0.72)`
- Border: `1px solid rgba(110,76,61, 0.28)` (brand border)
- Shadow: `0 22px 58px rgba(0,0,0, 0.18)`

**Form Card** (contact form, anketa)
- Background: `rgba(255,255,255, 0.86)`
- Border: `1px solid rgba(0,0,0, 0.12)`
- Border-radius: 24px
- Padding: 18px

**Glass Badge / Pill**
- Background: `rgba(255,255,255, 0.28)`
- Border: `1px solid rgba(0,0,0, 0.12)`
- Border-radius: 999px
- Padding: 10px 14px
- Backdrop-filter: blur(10px)
- Shadow: `inset 0 1px 0 rgba(255,255,255, 0.28)`
- Font: 0.95rem weight 600, color rgba(28,27,27, 0.78)

### Inputs & Forms
- Background: `rgba(255,255,255, 0.70)`
- Text: `#1C1B1B`
- Border: `1px solid rgba(0,0,0, 0.12)`
- Padding: 12px 16px
- Border-radius: 16px
- Focus: `outline: 3px solid rgba(110,76,61, 0.35)`, outline-offset 3px, border-radius 10px
- Placeholder: `rgba(28,27,27, 0.45)`

### Navigation (Sticky Header)
- Background (scrolled): `rgba(255,255,255, 0.78)` + backdrop-filter blur(12px)
- Border-bottom: `1px solid rgba(0,0,0, 0.08)`
- Shadow (scrolled): `0 10px 30px rgba(0,0,0, 0.08)`
- Active nav link: `background: rgba(0,0,0, 0.06)`, border-radius 999px
- Scroll offset for anchors: 84px

### Hero Section
- Container: max-width 1240px, border-radius 24px, overflow hidden
- Surrounded by dark stage (`#6A6A6A`) with padding 44px 18px
- Background: photo + radial gradient + linear gradient for readability
- Volumetric overlays: grain PNG, vignette PNG, readability gradient
- Logo: absolute positioned top-right, Bodoni Moda, brand color
- Inner padding: 62px 66px 58px (desktop), 44px 22px 40px (tablet), auto (mobile)

### Lightbox / Modal
- Backdrop: `rgba(0,0,0, 0.55)`
- Dialog: max-width 1120px, border-radius 20px, Elevation 3 shadow
- Background: `rgba(255,255,255, 0.92)`
- Close button: border-radius 12px, glass background

### Why Us Section (Brand Accent)
- Stats cards: glass background with brand left-stripe (4px gradient bar)
- Top 3 stats: brand-tinted warm background, brand borders, deep brown numbers
- Decorative radial gradients (warm/cognac) behind section for depth

### FAQ
- Items: border-radius 16px, glass background, standard shadow
- Hover: lift + shadow intensification

## 5. Layout Principles

### Spacing System
- Section padding: 64px vertical (desktop), 44px (tablet), 32px (mobile)
- Container: max-width 1120px, padding 0 20px
- Card gap: 14px (standard grid)
- Inner card padding: 16-18px
- Component gap (buttons, badges): 10-14px
- Micro spacing: 6px, 8px, 10px, 12px

### Grid & Container
- Content max-width: 1120px (body), 1240px (hero)
- Hero: single-column, text block max-width 740px
- Cards: 3-column grid (desktop), 2-column (tablet), 1-column (mobile)
- Pricing: 4-column grid (desktop), 2-column (tablet), 1-column (mobile)
- Process: 2-column split (1.05fr / 0.95fr), stacks on mobile
- Contact: 2-column (1.15fr / 0.85fr), stacks on mobile

### Whitespace Philosophy
- **Generous breathing room**: 64px between major sections. Content islands in warm lavender space.
- **Section alternation**: Primary bg (#EDE8EC) alternates with slightly lighter sections (#F4F0F3) via radial gradients for volumetric depth.
- **Hero as object**: The hero is a distinct card floating on a dark stage — a physical object, not a flat banner.
- **Vertical rhythm**: 12px between adjacent elements (headings, paragraphs), 18px between groups, 28px between major blocks within a section.

### Border Radius Scale
- **Small** (16px): FAQ items, inner elements, inputs, step cards
- **Standard** (24px): All primary cards, sections, containers, stat blocks
- **Large** (26px): About card, photo frames, special containers
- **Pill** (999px): All buttons, badges, pills, navigation active state, dot indicators
- **Image** (12-16px): Image thumbnails, case card images

**IMPORTANT: Use 24px as the default radius for all new cards and containers. The codebase has inconsistent values (22px, 26px) — normalize to 24px.**

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (Level 0) | No shadow, bg color only | Page background, section backgrounds |
| Glass Surface (Level 1) | Glass formula + inset highlight + whisper border | Badges, pills, secondary buttons, list items |
| Card (Level 2) | Glass formula + Shadow Soft (14px 38px) | Standard content cards, reviews, FAQ |
| Featured (Level 3) | Stronger glass + Shadow Medium (22px 58px) | Featured pricing, highlighted cards |
| Hero (Level 4) | Shadow Hero (34px 95px) + volumetric overlays | Hero card only |
| Modal (Level 5) | Elevation 3 (34px 95px 0.28) + backdrop blur | Lightbox, modals, photo zoom |

### Glass Depth Formula
Every elevated surface follows this layering:
1. **Background**: `rgba(255,255,255, [opacity])` — opacity controls visual weight
2. **Border**: `1px solid rgba(0,0,0, [0.06-0.14])` — whisper-weight
3. **Backdrop blur**: `blur(10px)` — creates frosted glass effect
4. **Top highlight**: `inset 0 1px 0 rgba(255,255,255, [0.18-0.35])` — simulates light hitting top edge
5. **Shadow**: multi-layer for depth — scaled by elevation level

### Volumetric Extras (Hero & Special Sections)
- Grain texture overlay: 03_grain.png at low opacity (~12%) with mix-blend-mode overlay
- Radial gradients for light pools: `radial-gradient(ellipse, rgba(bg-rgb, 0.88), transparent)`
- Section-level radial gradients create "light source" effects from corners

## 7. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Single column, full-width buttons, hero overlays hidden |
| Tablet | 640-980px | 2-column grids, reduced hero padding |
| Desktop | >980px | Full layout, 3-4 column grids, all effects |

### Touch Targets
- Buttons: 14px vertical padding, full-width on mobile
- Badge/pill: 10px 14px padding
- Navigation: adequate tap spacing
- Interactive cards: full card is tappable

### Collapsing Strategy
- **Hero**: padding shrinks from 62px to 44px to 22px. Logo repositions. Overlays hide on mobile.
- **Grids**: 3-4 col -> 2 col (980px) -> 1 col (640px)
- **Process section**: 2-column -> stacked
- **Contact section**: 2-column -> stacked, separator line hides
- **Buttons**: full-width on mobile, centered
- **About card**: horizontal layout -> vertical stack (860px)
- **Stats grid**: auto-fit with min 170px (adapts naturally)

### Image Behavior
- All images: max-width 100%, height auto, display block
- Case card images: aspect-ratio 4/3, object-fit cover
- About photo: 118px square (desktop), 132px square (mobile), rounded 22-26px
- Hero background: cover, center bottom position

## 8. Accessibility & States

### Focus System
- Focus-visible: `3px solid rgba(110,76,61, 0.35)`, outline-offset 3px, border-radius 10px
- Skip-to-content link: absolute positioned, visible on focus
- All interactive elements receive visible focus indicators

### Interactive States
- **Default**: Glass surface with whisper border
- **Hover** (desktop only, `@media (hover:hover)`): translateY(-3px) for cards, translateY(-1px) for buttons, shadow intensifies, border darkens
- **Active**: translateY(0), shadow reduces to Elevation 1
- **Focus**: Brand-colored outline ring

### Motion
- Standard easing: `cubic-bezier(.2,.8,.2,1)` (ease-out, lively)
- Fast duration: 160ms (buttons, toggles)
- Standard duration: 240ms (cards, hover states)
- Reveal duration: 420ms (scroll reveal animations)
- Respects `prefers-reduced-motion: reduce` — all animations disabled

### Color Contrast
- Primary text (#1C1B1B) on background (#EDE8EC): >12:1 ratio (WCAG AAA)
- Muted text (rgba(28,27,27,0.70)) on background: >6:1 ratio (WCAG AA)
- White text on black button: >15:1 ratio (WCAG AAA)
- Brand brown (#6E4C3D) on background: >4.5:1 ratio (WCAG AA)

## 9. Agent Prompt Guide

### Quick Variable Reference
```css
:root {
  /* Surface */
  --bg: #EDE8EC;
  --bg-rgb: 237, 232, 236;
  --bg-alt: #F4F0F3;
  --glass-rgb: 255, 255, 255;

  /* Text */
  --text: #1C1B1B;
  --muted: rgba(28, 27, 27, 0.70);
  --subtle: rgba(28, 27, 27, 0.55);

  /* Brand */
  --brand: #6E4C3D;
  --brand-deep: #4F352B;
  --brand-soft: rgba(110, 76, 61, 0.18);

  /* Interactive */
  --accent: #1C1B1B;

  /* Layout */
  --container: 1120px;
  --pad: 20px;

  /* Radius */
  --radius: 24px;
  --radius-sm: 16px;
  --radius-pill: 999px;

  /* Shadows */
  --shadow-soft: 0 14px 38px rgba(0, 0, 0, 0.16);
  --shadow-md: 0 22px 58px rgba(0, 0, 0, 0.18);
  --shadow-btn: 0 18px 45px rgba(0, 0, 0, 0.22);
  --shadow-hero: 0 34px 95px rgba(0, 0, 0, 0.52);
  --elev-1: 0 10px 24px rgba(0, 0, 0, 0.10);
  --elev-2: 0 18px 40px rgba(0, 0, 0, 0.14);
  --elev-3: 0 34px 95px rgba(0, 0, 0, 0.28);

  /* Glass */
  --glass-blur: 10px;
  --glass-border: rgba(0, 0, 0, 0.08);

  /* Typography */
  --font: "Manrope", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --font-logo: "Bodoni Moda", "Playfair Display", Georgia, serif;
  --h1: clamp(2.35rem, 4.2vw, 3.75rem);
  --h2: clamp(1.55rem, 2.4vw, 2.15rem);
  --h3: 1.08rem;

  /* Animation */
  --ease: cubic-bezier(.2, .8, .2, 1);
  --dur-fast: 160ms;
  --dur: 240ms;
}
```

### Example Component Prompts

- "Create a new card section: use `rgba(255,255,255, 0.55)` background, `1px solid rgba(0,0,0, 0.08)` border, 24px border-radius, `backdrop-filter: blur(10px)`, shadow `0 14px 38px rgba(0,0,0, 0.16)`. Padding 16px. Hover: translateY(-3px) with Elevation 2 shadow. Heading: Manrope 1.08rem weight 850, letter-spacing -0.01em. Body text: rgba(0,0,0, 0.62), line-height 1.45."

- "Create a glass pill badge: `rgba(255,255,255, 0.28)` background, `1px solid rgba(0,0,0, 0.12)` border, 999px border-radius, padding 10px 14px, `backdrop-filter: blur(10px)`, `inset 0 1px 0 rgba(255,255,255, 0.28)` inner shadow. Text: 0.95rem weight 600, color `rgba(28,27,27, 0.78)`."

- "Create a primary CTA button: `#1C1B1B` background, `#ffffff` text, padding 14px 22px, border-radius 999px, shadow `0 18px 45px rgba(0,0,0, 0.22)`. Font weight 650. Hover: translateY(-1px). And a secondary glass button: `rgba(255,255,255, 0.26)` background, `1px solid rgba(0,0,0, 0.14)` border, `backdrop-filter: blur(10px)`, same pill shape."

- "Build a brand-accented stat card: glass background with `linear-gradient(180deg, rgba(255,255,255, 0.98), rgba(238,231,226, 0.92))`, brand border `rgba(110,76,61, 0.32)`, left accent bar 6px wide with `linear-gradient(180deg, rgba(110,76,61, 0.9), rgba(110,76,61, 0.2))`. Number: Manrope clamp(1.35rem, 2.2vw, 2rem) weight 900 color `#4F352B`. Label: 0.98rem color `rgba(60,34,20, 0.78)`."

### Do's and Don'ts

**DO:**
- Use CSS custom properties from the variable reference above
- Apply glassmorphism formula consistently on all surfaces
- Use pill (999px) radius for all buttons and badges
- Use 24px radius for all cards and containers
- Keep the warm lavender-beige (#EDE8EC) as the base — it IS the brand
- Use cognac brown (#6E4C3D) only for accent elements (icons, borders, left stripes)
- Respect reduced-motion preferences
- Test glass effect on both light and dark hero backgrounds

**DON'T:**
- Use Bodoni Moda for anything except the logo
- Use blue, purple, or cold accent colors — the palette is exclusively warm
- Use heavy borders (>1px) or solid opaque backgrounds on cards
- Create flat/solid cards without the glass effect
- Use border-radius values outside the scale (16px, 24px, 999px)
- Use pure black (#000000) — always use near-black (#1C1B1B)
- Add new shadow definitions — use the existing scale
- Hardcode colors — always reference CSS variables

### Iteration Guide
1. Glass opacity controls visual hierarchy: 0.28 (subtle) < 0.55 (standard) < 0.72 (featured) < 0.86 (dense/form)
2. Border opacity reinforces: 0.06 (whisper) < 0.08 (standard) < 0.12 (interactive) < 0.14 (strong)
3. Shadow scale follows elevation: Soft (14px) < Medium (22px) < Button (18px + deeper) < Hero (34px)
4. Warm is the word — every gray in this system carries pink/brown undertones, never blue
5. The hero is a physical card object on a dark stage, not a flat banner
6. Sections gain depth via radial gradients and grain overlays, not borders
7. Buttons are always pills (999px). Cards are always 24px rounded. No exceptions.
8. Brand brown appears in: logo, icon tints, accent borders, stat stripes, focus rings. Nowhere else.
