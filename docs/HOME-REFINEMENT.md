# Home refinement

## What changed

Home now has one photo-led Next up object. It selects the soonest plan requiring the current viewer, then an upcoming approved or proposed plan, then a featured idea. Its status, title, metadata and action describe that one item. Additional items needing the viewer link directly to the Needs you filter in Plans. Empty subsections, the date header, counters and extra taglines were removed.

Desktop uses a 12-column layout: composer spans 1–7, Next up spans 9–12. Tablet retains the two-column order; phones keep the composer first and Next up below it. The composer has a 1px ink border, no resize grip, and a comma-formatted budget backed by a numeric value. The existing limitation note remains directly below it.

All four ideas now have photographs. At wide widths they fit one row; tablet uses two columns and phones use one. Existing illustrations were found in the initial Git commit, but photographs were selected per the latest request. The new images are downloaded project assets, with descriptive alt text and matched crops. No images are hotlinked at runtime.

The Expenses outing filter now has a custom 12px chevron, 44px height and 15px text. Table headers are 14px, desktop rows are 15px, and mobile rows are 14px; supporting metadata stays at least 13px.

## Number audit

No arithmetic mismatch was found. The sample lunch reconciles as follows:

| Meaning | Amount |
| --- | --- |
| Estimate per person | ₦18,500 |
| Headcount | 8 |
| Estimate total | ₦148,000 |
| Budget total | ₦180,000 |
| Recorded total | ₦60,000 |

Plans labels the cost as Estimate · total. The Plan Sheet continues to show its per-person calculation and separate allowance. Expenses now shows Estimate total and its calculation alongside explicitly labelled Recorded and Budget totals. The overview includes budgets from all active plans, so its ₦330,000 allowance includes the separate ₦150,000 pottery proposal.

## Photography

| Experience | Local file | Credit |
| --- | --- | --- |
| A little clay play | `public/images/pottery.jpg` | [Jonathan Cosens Photography on Unsplash](https://unsplash.com/photos/a-person-is-making-clay-on-a-wheel-ObocATAlfE8) |
| Meet you on the court | `public/images/tennis.jpg` | [Denis Zelenykh on Unsplash](https://unsplash.com/photos/a-tennis-racket-and-ball-on-a-tennis-court-39od8lWlPSA) |

Both were visually inspected before use. None of the four current ideas still requires a placeholder photograph. These are illustrative activity photos, not verified photographs of the listed Lagos venues.

## Verification

- Production build and lint pass.
- All 12 Playwright browser checks pass in installed Chrome. The original ten journeys remain; two additional checks cover Next up selection/fallback, manager review, filtered navigation, formatted budgets, financial labels, and computed expense-control sizes.
- Home was captured in four states at each of 1440, 1280, 1024, 768 and 390px: needs the viewer, upcoming only, no plans/featured idea, and manager awaiting approval. All 20 combinations passed layout, image, crop, grid-column, border and resize checks without page overflow or browser errors.
- The mobile composer, details expander, full-width primary action, content order, one-column ideas and bottom navigation remain intact. Existing full desktop/mobile approval, RSVP, expense and export journeys passed.
- Expenses was captured at desktop and phone widths. Computed visible table/header/meta sizes were all at least 13px. The custom select’s measured height is 44px and its chevron is 12×12px.
- Screenshots and the measured results live in `.artifacts/home-refinement/`, which is ignored by Git.

No separate unit-test suite exists. Firefox, Safari, real device hardware and screen-reader output were not tested. No backend or external workflow was added, and nothing was committed, pushed or deployed.
