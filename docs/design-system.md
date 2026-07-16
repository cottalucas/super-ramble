# Design system

## Principle

Match Todoist closely so the product reads as native. Someone who uses Todoist
should open Super Ramble and feel at home. [docs/reference/](reference/) holds
the screenshots that are the source of visual truth. Refine against those
screenshots, not from memory. The tokens below are defined here so the look never
regresses even as views change.

## Litmus test

A screenshot of any view should be hard to tell apart from Todoist at a glance.
If a view drifts from that bar, it is wrong, even if it builds.

## Visual tokens

```
--ds-red          #dc4c3e   primary actions, active nav, Add task
--ds-red-tint     #fef0ed   active nav row fill
--ds-p1           #d1453b   priority 1 flag and checkbox ring
--ds-p2           #eb8909   priority 2
--ds-p3           #246fe0   priority 3
--ds-p4           transparent   priority 4 (none)
--ds-sidebar-bg   #fcfaf8   warm near-white sidebar
--ds-canvas       #ffffff   main content
--ds-ink          #202020   primary text
--ds-ink-soft     #808080   secondary text and meta
--ds-line         #ededed   hairlines
--ds-due-green    #058527   due time and date text
```

Font: Inter, the closest free match to Todoist's sans. Tight row rhythm.
Generous left padding in the content column. A slim, warm sidebar.

## Dark theme tokens

A second value per token, applied through `[data-theme="dark"]` on the root
element, never a separate stylesheet. Red stays the brand constant in both
themes; due-green shifts lighter, since the light value is too dark to read on
a dark surface.

```
--ds-red          #dc4c3e   unchanged, the brand constant
--ds-red-tint     #3a211f   dark red-tinted active nav row fill
--ds-p1           #e5675c   priority 1, brightened for contrast on dark
--ds-p2           #f0994a   priority 2, brightened for contrast on dark
--ds-p3           #5b93e8   priority 3, brightened for contrast on dark
--ds-p4           transparent   unchanged
--ds-sidebar-bg   #191919   near-black sidebar, a shade darker than canvas
--ds-canvas       #202020   main content
--ds-ink          #e8e6e3   primary text
--ds-ink-soft     #9a9a9a   secondary text and meta
--ds-line         #2e2e2e   hairlines
--ds-due-green    #3ddc65   brightened for contrast on dark
```

The theme choice is a user setting (Light default, Dark), persisted in
localStorage, not tied to the OS. Verify every token pair against the
anti-pattern checklist's contrast bar before calling dark mode done; a token
carried over unchanged from light onto a dark surface is the most likely way
to fail it.

## Inline add-task

Clicking a "+ Add task" line (Inbox, Project sections, the no-section list,
Upcoming's per-day line) replaces that line in place with the add-task form:
a thin `--ds-line` border, `--ds-canvas` background, no dark backdrop, no
centered floating card. Matches Todoist's own inline row expansion, not a
dialog interrupting the list. Escape or Cancel collapses back to the plain
line without writing; Enter (no shift) or Add task writes through the same
`store.createProjectTree` call every Add-task entry point shares, then
collapses back too. `src/components/TaskDetail.jsx` (opening an existing
task) is the one Add-task-adjacent surface that stays a real modal; it edits
a task already in the tree, not a fresh add, so the "no row to expand into"
exception does not apply to it.

**Reopened 2026-07-10, reported directly against a real Todoist screenshot
of its own Add-task dialog**: the sidebar's global Add task no longer has
"no row to expand into" as its reason to stay a popover. It now opens the
same centered `.modal` chrome `QuickAddModal.jsx` already uses for "Add
sub-task" and every other no-row caller, sharing the exact same
`TaskAddForm.jsx`, the same overlay backdrop, the same width and
positioning `AddProjectModal.jsx`'s Add Project dialog already established
as this app's one correct centered-dialog pattern. This is a direct reversal
of the phase 2.8 part 4 decision recorded in `docs/roadmap.md`; do not
revert to a popover for this trigger again without a new, equally explicit
decision. The prior popover's own `.popover` wrapper carried a visible
`1px solid var(--ds-line)` border around the whole card, on top of
`TaskAddForm`'s own borderless `.modal-name`/`.modal-desc` fields; switching
to `.modal` (no border, shadow only, the same chrome Add Project and
Settings already use) removes that border as a side effect, not a separate
fix. A bordered surface for this app's centered dialogs is not a
convention: the only borders that belong on an add-a-thing surface are
`.inline-add`'s (the in-list expansion above) and `.comment-add-box`'s (Task
detail's comment section, "Task detail: comment section" below), both
deliberately mimicking Todoist's own inline-row-expansion feel, not a
floating dialog. A centered `.modal`, wherever it is used in this app, never
carries its own border.

## One primary action per surface

The red Add task is the single primary action. Every other control is secondary
or quiet. Do not place two equally loud buttons on one surface.

## Modal overflow menu

A modal's low-frequency, destructive action collapses into a small "..."
trigger next to the modal's own close control, opening the shared `Popover`
component, styled `--ds-red`. `TaskDetail.jsx`'s task options menu (Delete
task) established this pattern. A future modal with the same shape reuses it
instead of re-deriving its own.

Static, non-interactive metadata (a created/modified timestamp, for one)
does not belong in that menu: it reads as a click target it is not, and it
is easy to miss behind a trigger a user has no reason to open unless they
already want to delete something. It belongs in the modal's own rail or body
instead, at the bottom, after a hairline divider, the same way
`TaskDetail.jsx`'s Added/Updated lines sit below Labels in the right
rail (below Reminders before that field was removed, 2026-07-10). Reported
directly against a screenshot; see docs/resolution-log.md, 2026-07-07.

## Sidebar project list

Matches native Todoist's own sidebar chrome, not a redesign of anything
else about the row:

- The section label reads "My Projects," not "Projects."
- "My Projects" collapses as a whole: a chevron (`.nav-section-caret`, the
  same `IconCaret`/rotate-on-collapse convention every other caret in this
  app already uses) next to the label hides the entire root project list at
  once. This is a separate, persisted preference from a single project's
  own children collapsing via its own `ProjectNode` caret, which stays
  unpersisted (projects carry no `collapsed` field, only sections do).
  Persisted the same way `src/lib/theme.js`, `src/lib/layout.js`, and
  `src/lib/sidebar.js` already persist their own client-only preferences:
  `src/lib/projectsPanel.js`, one new file following that exact pattern.
- Each sidebar project row shows a colored "#" character (`.project-hash`)
  before its name, in place of a filled dot, matching Todoist's own
  sidebar convention. Still driven by the same `colorHex(project.color)`
  value as before, applied as text color on the glyph instead of a
  circle's background. `.project-dot` (a filled circle) is unchanged and
  stays in use everywhere else this app shows a project's color: the Add
  Project color picker, a task's meta line, and a project view's own
  title, contexts Todoist itself still renders as a dot, not a hash. Do
  not replace those too; the hash is a sidebar-list-specific convention,
  not a global one.

**Sizing not yet audited against a real screenshot.** `docs/reference/`
still holds only its own README placeholder, no actual Todoist sidebar
screenshots, as of this pass (see the resolution log's redirect-URI-fix
and sidebar entry). `.nav-item`, `.nav-section-label`, `.project-dot`/
`.project-hash`, and `.count` all still carry their pre-existing sizing;
none of it was changed on a guess. A future pass with real sidebar
reference screenshots in `docs/reference/` should audit all four against
them concretely (exact px values, not "looks close") before touching any
of this section's own new elements' sizing further.

## Task detail: comment section

`TaskDetail.jsx`'s comment section, bottom of the main column:

- A collapsible "Comments N" header, only rendered once at least one
  comment exists, exactly as before this pattern existed (a task with zero
  comments shows no header at all, just the add box below). The chevron
  uses the same inline-style rotate-on-collapse convention `ProjectNode`'s
  own project caret and the sidebar's "My Projects" caret already use
  (`style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}`), not the
  separate CSS `.collapsed`-class convention `ProjectView`'s section heads
  use; pick whichever an immediate neighbor in the same file already uses,
  don't introduce a third variant.
- The add box (`.comment-add-box`) is a proper bordered box, the same
  thin `--ds-line` border and `--ds-canvas` background `.inline-add`
  already established for inline add-task (see "Inline add-task" above),
  not a bare borderless input. Cancel and Comment only appear once there is
  text, hidden entirely when empty rather than shown disabled, matching
  the anti-pattern checklist's "no dead controls" rule. Enter (no shift)
  still submits, matching this app's one existing single-line-entry
  convention; Shift+Enter inserts a newline instead, since a comment, unlike
  a task's content field, is allowed to run multi-line.
- **Submit-guard convention**: any add-a-thing-on-Enter handler that awaits
  a store write must gate on a `useRef` boolean set synchronously before the
  await starts, not on clearing the input's state alone. Verified live that
  clearing state alone is not sufficient: a tight burst of Enter keydowns
  (no real time gap between them, the same shape a very fast key-repeat or
  a scripted double-fire can produce) can fire a second handler call before
  React has re-rendered with the cleared value, so every call in the burst
  still reads the old, non-empty value from its own stale closure and
  posts a duplicate. A ref mutation is synchronous and shared across every
  closure immediately, with no render required in between, so it closes
  this gap where a state-only guard does not. See
  `TaskDetail.jsx`'s `commentSubmittingRef` and the resolution log's
  comment-guard entry for how this was actually caught, not just reasoned
  about.

## Project field: no section suffix, and a bounded width

`ProjectPicker.jsx`'s trigger shows only the project's own name (or
"Inbox"), never `<project> / <section>`, matching native Todoist's own
picker exactly. The picker's popover still lists Sections underneath
unchanged; a task can still be assigned to one, the trigger just no longer
echoes it back.

A long project name truncates with an ellipsis instead of wrapping or
overflowing: `.project-picker-trigger` (`max-width: 200px`) constrains the
button, `.project-picker-label` (`min-width: 0`, `overflow: hidden`,
`white-space: nowrap`, `text-overflow: ellipsis`) is the flex child that
actually shrinks and clips. Both are scoped to this one trigger, not
applied to `.chip` itself: `.chip` is shared by every other picker trigger
in this app (Date, Priority, Labels) plus Settings' Theme toggle, and none
of those want a long value silently clipped. Check every
`.chip` call site before ever widening this scope back out to the shared
class.

## Recording indicator

A mic control (`src/components/VoiceRecorder.jsx`, first used in Super
Ramble) has two variants, one component so a single instance can stay
mounted across both (unmounting it mid-recording would tear down the active
`MediaRecorder`/stream). `--ds-red` marks the active-recording state
throughout, the same token every other primary/active surface already uses
(Add task, active nav, priority 1). No gradient, no canvas waveform,
everywhere:

- `variant="compact"`: the idle entry point, a small icon button next to the
  textarea (`.voice-recorder`, `.voice-mic`), tinting `--ds-red` (a light
  `color-mix` background, matching how other active states here tint rather
  than fill solid) the instant it's clicked.
- `variant="full"`: once recording actually starts, a dedicated view
  (`.voice-full`) replaces the textarea, matching how `loading`/`error`/
  `preview` are each already a full modal-body state in
  `SuperRambleModal.jsx`, reported directly against a screenshot: a small
  corner widget read as an afterthought, not a real recording moment. A
  bigger version of the same shape, not a different one: one circular
  `--ds-red` stop button (`.voice-full-stop`), a ring behind it
  (`.voice-full-ring`) scaled by a CSS `transform` driven directly by the Web
  Audio API's live level, exactly the same technique the old single small
  dot used, just bigger and centered, and a monospace-numeral timer
  (`.voice-full-timer`) that tints `--ds-red` in the last 15 seconds before
  the recording cap, so the cutoff is never a surprise. Transcribing swaps
  the ring for a plain CSS `@keyframes` pulse (no JS animation library) and a
  short status line.

A future recording control reuses this shape (compact icon-tints-red entry
point, a dedicated full view with one scaled ring and a timer) instead of
re-deriving its own; matches docs/roadmap.md's Out of scope line
("Competing on capture quality or live-audio streaming") by staying this
simple on purpose, a layout and prominence fix, not a first pass toward
something more elaborate. See docs/resolution-log.md, 2026-07-08.

## Responsive

A defensive pass, not a second layout: below 640px (a phone, not a small
desktop window) nothing about interaction, drag-and-drop, or a token
changes, only enough CSS/layout adjustment that nothing clips, overflows, or
renders off-screen. Board is explicitly exempt; a phone-width viewport
always gets List, regardless of the user's stored Layout preference
(Board's own drag machinery is not being made touch-friendly this pass).

- The sidebar becomes a closed-by-default overlay below 640px
  (`.sidebar-mobile`, a fixed-position panel over a dimmed
  `.sidebar-backdrop`), not a fixed-width flex sibling squeezing the content
  column. Opens on tapping the reveal button, closes on an outside tap or
  Escape, the same shape `Popover.jsx` already uses for closing. **Unlike**
  Theme and Layout, which persist to `localStorage`
  (`src/lib/theme.js`, `src/lib/layout.js`), this is deliberately not
  persisted: `src/lib/sidebar.js`'s stored show/hide preference is a
  desktop choice and must survive a phone visit unchanged, so
  `App.jsx`'s Shell tracks the overlay's open state in memory only,
  driven by a `matchMedia('(max-width: 640px)')` listener, entirely
  separate from that stored value.
- `Popover.jsx`'s positioning resolves all four viewport edges, not just the
  right one: flips right-aligned if it would overflow the right edge,
  clamps the left edge to an 8px margin either way, and flips to open above
  the anchor instead of below if it would overflow the bottom edge. Every
  picker built on `Popover` (date, priority, label, project, Display/Layout,
  project and section options) gets this for free.
- `.modal` gained a `max-height` and became a flex column;
  `.modal-body` scrolls internally instead of letting the whole modal grow
  past the viewport and push its own footer off-screen. `.detail-body`
  (`TaskDetail.jsx`) and `.sr-preview-body` (`SuperRambleModal.jsx`) already
  managed their own internal scroll and are unaffected.
- `.detail-body`'s two-column layout (a flexible main column beside a fixed
  220px rail) assumes a 720px-wide modal; below 640px it stacks instead,
  full-width main content then the rail below it. Found live, not assumed:
  the fixed rail alone left so little room for the main column that task
  titles wrapped character by character.

See docs/resolution-log.md, 2026-07-08, for what was checked and what broke
before the fix.

**`.sidebar-reveal`'s own crowding fix, reopened 2026-07-15 for the
non-phone case.** The phone-width rule above already reserves clearance
for this button by bumping `.content-inner`'s left padding to 56px; that
rule is scoped to `@media (max-width: 640px)` because on a phone the
sidebar is always the mobile overlay. But the same button also renders any
time a desktop user manually hides the sidebar (`App.jsx`'s toggle,
independent of viewport width), and nothing outside the phone media query
gave it clearance: `.content-inner`'s own top padding (36px) was never
enough, the button's bottom edge (46px) sat below the heading's own top
edge, reproduced live at both 750px and 1280px viewport widths (the phone
fix's horizontal clearance was never the issue at these widths; the
vertical one was, and no rule addressed it at all outside 640px). Fixed
with `.content.sidebar-hidden .content-inner { padding-top: 56px }`,
`sidebar-hidden` a new class `App.jsx` puts on `.content` whenever the
reveal button is showing, at any width, reusing the exact 56px figure the
phone rule already verified against a screenshot for this same button
rather than guessing a second number.

## Landing / signed-out gate

`App.jsx`'s `Gate()`, signed out: a real two-side split view (`.landing`),
sign-in side left, value-prop side right, mirroring a real product login
screen's shape (Todoist's own included), never its copy. Supersedes the
2026-07-10 landing-page entry's visual shape; that entry's copy (the two
value-prop paragraphs, the footer credit) carries over unchanged.

- **Sign-in side (`.landing-signin`)**: a small `.landing-wordmark`
  ("Super Ramble," not a giant headline) plus a short mode-dependent lede,
  above a bordered `.landing-signin-card`. Inside the card: "Continue with
  Google" (unchanged, the one OAuth provider this app has, no Facebook or
  Apple), a `.landing-divider`, then a real email/password form
  (`AuthContext.jsx`'s `signInWithEmail`/`signUpWithEmail`/
  `resetPassword`, alongside Google, not replacing it). One `mode` state
  (`'login' | 'signup'`) swaps the same card between the two instead of a
  separate route: login shows email, password, "Forgot your password?"
  (`resetPassword`, a plain confirmation line on success, no modal), and
  "Log in"; sign-up adds a confirm-password field and swaps the button to
  "Sign up," checked against the password field client-side before ever
  calling Firebase. `authErrorMessage()` (`App.jsx`) maps real Firebase
  Auth error codes to one plain, specific line each (wrong password, no
  such account, email already in use, weak password, invalid email, the
  provider itself turned off) instead of ever showing a raw error object.
  `.landing-toggle-mode` switches between the two modes, clearing any
  error or reset-confirmation state.
- **One primary action still holds, reinterpreted, not dropped.** A sign-in
  screen genuinely has more than one equally valid path to the same single
  goal (signing in), the same way a real product's own login screen offers
  several provider buttons with none of them competing for attention
  against each other; "Continue with Google" and the email/password
  form's own submit button are both that goal's primary action, not two
  separate primaries fighting for attention. Secondary links inside the
  card ("Forgot your password?", the mode toggle) and the footer credit
  (`.landing-footer`, "Built by Lucas Cotta") all stay deliberately quiet
  text, never styled as buttons, so neither of the two real actions gets
  buried under them.
- **Value-prop side (`.landing-value`)**: the same two short paragraphs
  from docs/brief.md's Problem and Product sections, unchanged, run
  through the copy rules below. The old dashed "Product screenshot coming
  soon" placeholder is gone; `.landing-accent` in its place is a small
  looping CSS animation built from this app's own icons and tokens
  (`IconMic`, `IconSparkle`, `IconCheck`, a `--ds-red` pulse staggered
  across the three via `animation-delay`), not an imported image or a new
  animation library, restrained motion in the spirit of a real product
  screen's illustration without a real screenshot to show yet. A future
  pass with a real screenshot replaces `.landing-accent` outright, the same
  "clearly-marked stand-in, not a faked image" reasoning the placeholder it
  replaced already established.
- Stacks to one column below 640px (`.landing`'s own rule inside the
  existing phone-width media query, sign-in card first since the form is
  the immediate need on a phone visit), matching every other responsive
  rule in this doc; the phone override also resets the card's own
  `text-align` to `left` so `.landing`'s own centered text does not bleed
  into the form fields' typed text.
- `.auth` still exists, scoped down to just the brief "Loading." text both
  `Gate()` and `Shell` show before the real user/task state is known; it is
  not the signed-out gate's own class.
- **Manual prerequisite, not a code gap**: the Firebase project's
  Authentication settings need the Email/Password sign-in provider turned
  on (Firebase console, Authentication > Sign-in method) for
  `signInWithEmail`/`signUpWithEmail` to actually succeed. If it is off,
  every call fails with `auth/operation-not-allowed`, surfaced honestly via
  `authErrorMessage()` ("Email sign-in is not turned on yet. Use Google for
  now."), not a fake success state. Confirmed live, off, as of 2026-07-10;
  see docs/resolution-log.md.
- Before touching this again: run `npm run verify:prod-env` and confirm a
  signed-out visit to the live site actually renders this and nothing
  else, no cached sidebar or seeded data. See docs/resolution-log.md,
  2026-07-07 and 2026-07-10, for two separate real incidents where a
  keyless or flagged-on build shipped the wrong thing here instead.
- **Reopened 2026-07-10, reported directly against a real Todoist login
  screenshot: the gate always renders in light theme, regardless of the
  signed-in app's stored dark-mode preference.** `.landing`'s background
  currently resolves `var(--ds-sidebar-bg)` off whatever `[data-theme]` the
  pre-paint `index.html` script already set from `localStorage`, so a user
  who left the app in Dark sees a near-black landing page; that is the
  actual cause of the mismatch against a white-themed real login screen,
  not a missing visual-fidelity pass. Real Todoist's own login screen has
  no dark variant at all; it is a fixed, brand-controlled surface,
  independent of whatever theme the product applies once signed in. `Gate()`
  matches that: force light theme's token values for everything under
  `.landing` specifically (a scoped override, not a change to the stored
  preference or to `[data-theme]` on the root element itself, which must
  keep driving the signed-in `Shell` exactly as before). The `.landing-accent`
  three-icon pulse animation and the `.landing-footer` "Built by Lucas
  Cotta" credit are both already built (this same section, and the
  2026-07-10 UX-parity entry in docs/resolution-log.md); carry both over
  unchanged, do not re-derive either.

## Sidebar avatar menu

`Sidebar.jsx`'s `sidebar-head-trigger` (the avatar circle plus name at the
top of the sidebar) opens a `Popover`, matching real Todoist's own
name-triggers-a-small-menu convention. Phase 2.8 part 2 (docs/roadmap.md)
first built this as a name/task-count header, a divider, and a passive
"Synced <time ago>" line, deliberately leaving out every item this app has
no real feature behind (Add a team, a duplicate Reporting entry, Print,
What's new, Try Pro, the changelog line): still correct, still out, per
`docs/roadmap.md`'s Out-of-scope list.

**Reopened 2026-07-10, reported directly against a real Todoist avatar-menu
screenshot: the menu is missing the two items this app does have a real
feature behind.** Below the existing header, divider, and "Synced <time
ago>" line, add two real rows, each a plain menu-item button
(`.avatar-menu-item`, matching `.settings-nav-item`'s quiet, full-width,
left-aligned button styling rather than inventing a new one):

- **Settings**, calling `setSettingsOpen(true)`. Dark mode itself is not a
  separate row here; it stays reachable exactly where it already lives,
  `SettingsModal.jsx`'s Theme section, one click further in through this
  Settings row.
- **Log out**, real (non-local) accounts only, gated on the same `isLocal`
  check every other local-preview-only control in this app already uses.
  Opens the same confirm-before-sign-out flow, "Signing out doesn't delete
  anything. Sign in again anytime to see your tasks." (`ConfirmDialog`,
  the exact copy the 2026-07-10 sign-out-copy fix already set), not a second
  wording and not an instant sign-out with no confirm step. Local preview
  hides this row entirely rather than showing a control that would do
  nothing.

**This is now the only sign-out control in the app, as of 2026-07-15.**
`SettingsModal.jsx`'s Account section used to carry its own separate "Sign
out" button and `ConfirmDialog`, a second, duplicate copy of exactly this
flow. Verified independent (its own `confirmSignOut` state, its own
`doSignOut` calling `signOut()` directly, no shared state with this menu)
before removing it outright: a settings screen showing an account's own
sign-out control is a common enough pattern elsewhere that it looked
intentional rather than leftover, but this app already had the real one
here. Do not re-add a Sign out control to `SettingsModal.jsx`'s Account
section; this avatar-menu row is where it lives.

**Reopened 2026-07-16, reported against a real Todoist screenshot: the name
row carries a small down-caret, and there is no separate gear icon at all.**
`sidebar-head-trigger` gains `IconCaret` (`.sidebar-head-caret`, `width={14}
height={14}`, tinted `--ds-ink-soft`) right after the name, static, no
rotate transform: a visual affordance marking that the row opens a menu, not
a control of its own. `onClick` stays on the outer button, unchanged.

`Sidebar.jsx`'s separate gear icon button next to this trigger is gone.
**The avatar-menu Settings row above is now the only Settings entry point in
the app**, the same pattern this section already established for Log out.
Do not re-add a second Settings control (a gear icon or otherwise) outside
this menu.

## Settings modal

`SettingsModal.jsx`'s two-pane chrome (left category nav, right detail pane)
predates this entry; **the row and spacing rhythm inside it, and the active
nav-item state, were reworked 2026-07-15**, reported directly against a real
Todoist settings screenshot (described by Lucas, not attached as an image;
no live Todoist session was reachable this pass either, so treat these as a
verified-by-description pass, not a pixel-measured one):

- **Active nav item is red text only** (`.settings-nav-item.active`), no
  background fill or outline. A tinted background box (this app's prior
  treatment) reads as a bigger, louder active state than Todoist's own,
  which only shifts the label's color. Still gets the ordinary `:hover`
  tint like every other row; that is independent of the active state, not a
  conflict with it.
- **Nav rows** stay a plain list, no dividers between them, `13px 10px`
  padding (bumped from `7px 10px` for more comfortable row height).
- **Right-pane rows are label-above-value**, not label-left-value-right: a
  small muted-gray label line (`.settings-label`, 12px), the value or
  control directly below it (`.settings-value`), left-aligned, no colon.
  `.settings-row` is a column flex, not a row flex, because of this.
- **A row with an inline action** (Todoist's Status/Connect-or-Disconnect)
  adds `.settings-row-inline` on top of `.settings-row`: the label+value
  block and the button share one line, button flush right, instead of
  stacking three deep.
- **Buttons stay the existing quiet/ghost style** (`.btn-quiet`) throughout,
  including Disconnect: Todoist's own reference reserves an outlined-red
  button for a truly destructive, hard-to-undo action (their "Delete
  account"), and this app has no equivalent in Settings once Sign out moved
  out (see "Sidebar avatar menu" above). Disconnecting Todoist is
  reversible (reconnect any time) and does not delete local data, so it
  stays quiet rather than inventing a new red-outline button variant for a
  case that does not need it. Introduce that variant only if a real
  destructive Settings action is ever added.
- **Section spacing** (`.settings-section`) is `28px 0` (up from `24px 0`),
  matching a more generous block rhythm than this app's own list-row
  spacing elsewhere; a settings screen reads as a form, not a task list.

## Copy rules (stop-slop)

Run these on every label, button, and empty state. Source:
github.com/hardikpandya/stop-slop.

- Active voice. The user does things; the product responds.
- No filler, no throat-clearing. Open on the point.
- Varied rhythm. Mix short and long sentences. Do not drone.
- No em dashes.
- Avoid the hyphen as a connector. Use a period or a comma instead. Compound
  words keep their hyphen (sub-task, brain-dump, client-side).
- Say what a thing does, plainly. No hype, no hedging.

## Anti-pattern checklist

Check every view against this before done.

- No tiny fonts. Body text stays comfortably readable.
- No cramped spacing. Honor the row rhythm; let the layout breathe.
- No low contrast. Text and controls meet a clear contrast bar.
- No inconsistent rhythm. Spacing and type follow the scale, not ad hoc values.
- No more than one primary action per view.
- No dead controls. A button, menu item, or "+" affordance that does nothing
  yet does not ship; build the option when it works, not before, and hide or
  omit the affordances that would not do anything in a given state (a
  not-yet-written preview's checkbox and row menu, for one) rather than
  leaving them clickable and inert.
