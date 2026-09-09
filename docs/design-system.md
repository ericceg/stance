# Stance workspace design

The redesign uses a neutral canvas, solid surfaces, and restrained teal accents. The shared `AppShell` owns navigation, page titles, reporting context, and the workspace footer on every route.

## Rules for future screens

- Use the semantic color variables in `globals.css`; keep light and dark surfaces paired.
- Use Geist Sans for headings and prominent values; reserve monospace for dense financial tables and identifiers. Preserve tabular numerals.
- Use the existing panel, section heading, field, and button classes. Desktop sections use 24px gaps and 24–28px padding; mobile layouts use 16–20px spacing.
- Give each page one primary heading. Use short descriptions and avoid repeating a title as a large promotional banner.
- Keep common tasks immediately visible. Put optional accounting details, chart configuration, and exposure maintenance in keyboard-accessible disclosures.
- Keep tables within a local horizontal scroll container. Search, sorting, and optional columns should not change portfolio calculations.
- Preserve visible focus, accessible input names, reduced-motion support, and all navigation destinations on mobile.

## Verification

Verified on 8 September 2026 using a separate SQLite database seeded with the repository's fictional portfolio. The existing local portfolio was not reset.

- `npm run check`: ESLint, all 65 tests, and the Next.js production build passed.
- Overview, breakdown, holdings, transactions, fees, import, settings, data issues, security detail, and transaction creation rendered in the browser.
- Checked narrow layouts at 390px; corrected the fees table's offscreen accessible-label overflow.
- Exercised holdings search (matching and empty results), expanded columns, chart holding selection and rebasing, and keyboard disclosure activation.
- Submitted a fictional CHF deposit through the production form, confirmed the transaction redirect and database record, and reseeded only the temporary demo database afterward.
- Checked light and dark presentation and captured production-build screenshots in `output/redesign/`.

Broker sync and external market refresh were not invoked during visual verification.
