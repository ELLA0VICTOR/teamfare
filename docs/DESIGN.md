# Teamfare design direction

Teamfare should feel like an invitation from a thoughtful colleague. The product helps employees find an outing, coordinate a plan, and finish the expense admin. Experience and practical details share equal importance.

## Visual language

- The central object is the Plan Sheet: an outing moves from idea to proposal, approval, happening, and explicit expense settlement.
- Warm paper (`#F7F3EA`), forest (`#1F4D3A`), near-black ink (`#1B201C`), and hairline rules. Ember (`#AD4318`) indicates something requiring the current viewer's action; the logo is the brand exception.
- Locally bundled Fraunces for titles and outing names; DM Sans for controls, operations, and tabular money. All text is at least 13px.
- Top navigation: Home, Plans, Expenses. On mobile, a bottom tab bar and sticky Plan Sheet action replace the desktop summary rail.
- The composer leads Home. One photo-led Next up item surfaces an action, an upcoming plan, or a featured idea. Ideas use consistent 4:3 photography in a four/two/one-column grid.
- Expenses use grouped ledgers and thin spend bars. No KPI cards, decorative stickers, sticky notes, sidebar, or chat console.
- Native dialogs provide the expense drawer and small confirmations, with explicit keyboard cycling, Escape dismissal, and focus restoration. Reduced-motion preferences suppress transitions.
- A requested change has a required note. Earlier notes remain visible as neutral reference once the request is resubmitted.

## References studied

- [OFFSITE](https://www.offsite.com/): experience discovery, venue context, and planning details.
- [Confetti](https://www.withconfetti.com/): experience categories, headcounts, and per-person pricing.
- [PeopleForce builder interview](https://www.youtube.com/watch?v=QYIFPamnOt8): distinct agent topics and explicit actions; experience discovery and expense reporting as complete workflows.

Teamfare uses its own layout, copy, palette, logo, and illustrations.

## Asset sources

The Teamfare mark is original SVG code. All four current experiences use locally saved photos, including pottery and tennis. Existing photos are retained on disk; `together.jpg` is no longer displayed but remains available as a project asset. Photos are downloaded locally from Unsplash. They illustrate sample experiences and do not depict verified Lagos venues.

| Local asset | Source |
| --- | --- |
| `public/images/together.jpg` | https://images.unsplash.com/photo-1528605248644-14dd04022da1 |
| `public/images/table.jpg` | https://images.unsplash.com/photo-1414235077428-338989a2e8c0 |
| `public/images/restaurant.jpg` | https://images.unsplash.com/photo-1517248135467-4c7edcad34c4 |
| `public/images/pottery.jpg` | [Jonathan Cosens Photography](https://unsplash.com/photos/a-person-is-making-clay-on-a-wheel-ObocATAlfE8) · https://images.unsplash.com/photo-1686472240661-db7f4eda4afe |
| `public/images/tennis.jpg` | [Denis Zelenykh](https://unsplash.com/photos/a-tennis-racket-and-ball-on-a-tennis-court-39od8lWlPSA) · https://images.unsplash.com/photo-1723980839949-184c5d2f45ba |

## Current boundary and next phase

This phase is a browser-local frontend. The composer uses local keyword selection to preselect an editable sample experience, not an AI service. Its fields prefill a saved draft; no research or availability claims are generated. Plans, RSVP choices, preferences, approvals, favourites, and expenses persist in localStorage. The manager switch is a preview control, not authentication. Nothing is booked, emailed, paid, or reimbursed.

The next phase needs authenticated employee and manager access, server-enforced approvals, a durable database, verified venue research, and agent tools. Challenge 2 requires the web application and central backend on Vultr. Serverless Inference is optional; select it based on tested model and tool-call support. This frontend has not been deployed or submitted.
