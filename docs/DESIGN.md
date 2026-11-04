# Teamfare design direction

Teamfare should feel like an invitation from a thoughtful colleague. The product helps employees find an outing, coordinate a plan, and finish the expense admin. Experience and practical details share equal importance.

## Visual language

- Warm paper (`#faf8f1`), forest green (`#254b3a`), burnt orange (`#b84b2b`), and muted butter accents.
- Locally bundled Fraunces for expressive titles; DM Sans for controls and supporting information.
- Top navigation: Discover, Our plans, and Expenses. No sidebar or studio shell.
- Photography, a printed invitation motif, original pottery and tennis illustrations, thin borders, and mostly square controls.
- Mobile navigation and single-column dialogs preserve the desktop hierarchy.
- Keyboard focus, native modal focus containment, Escape dismissal, and reduced-motion support.

## References studied

- [OFFSITE](https://www.offsite.com/): experience discovery, venue context, and planning details.
- [Confetti](https://www.withconfetti.com/): experience categories, headcounts, and per-person pricing.
- [PeopleForce builder interview](https://www.youtube.com/watch?v=QYIFPamnOt8): distinct agent topics and explicit actions; experience discovery and expense reporting as complete workflows.

Teamfare uses its own layout, copy, palette, logo, and illustrations.

## Asset sources

Illustrations and the Teamfare mark are original SVG code. Photos are downloaded locally from Unsplash. They illustrate sample experiences and do not depict verified Lagos venues.

| Local asset | Source |
| --- | --- |
| `public/images/together.jpg` | https://images.unsplash.com/photo-1528605248644-14dd04022da1 |
| `public/images/table.jpg` | https://images.unsplash.com/photo-1414235077428-338989a2e8c0 |
| `public/images/restaurant.jpg` | https://images.unsplash.com/photo-1517248135467-4c7edcad34c4 |

## Current boundary and next phase

This phase is a browser-local frontend. The sample planner uses keyword selection, not an AI service. Plans, RSVP choices, preferences, approvals, favourites, and expenses persist in localStorage. The manager switch is a preview control, not authentication. Nothing is booked, emailed, paid, or reimbursed.

The next phase needs authenticated employee and manager access, server-enforced approvals, a durable database, verified venue research, and agent tools. Challenge 2 requires the web application and central backend on Vultr. Serverless Inference is optional; select it based on tested model and tool-call support. This frontend has not been deployed or submitted.
