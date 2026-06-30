# Design system

## Status: placeholder

The real visual language is not set yet. It will be derived from screenshots of
the live Todoist Ramble flow once this skeleton deploys, so super-ramble stays
visually adjacent to the product it extends. The placeholder page exists to
deploy and to capture those screenshots against, not to set a style.

## TODO: fill tokens from screenshots

Once the skeleton is live and the Ramble flow is captured, fill these from the
screenshots. Until then this section is intentionally empty, not guessed.

- [ ] Color: surfaces, text, primary action, accent, borders, states.
- [ ] Type: font family, scale, weights, line height.
- [ ] Spacing: base unit and the rhythm built on it.
- [ ] Radius, elevation, and motion.
- [ ] Component tokens for the capture, propose, and confirm views.

Do not invent tokens before the screenshots exist. Adjacency to Todoist is the
point, and that comes from the real product, not from memory.

## Copy rules (stop-slop)

These apply to all UI copy and all docs. Source: github.com/hardikpandya/stop-slop.

- Active voice. The user does things; the product responds.
- No filler, no throat-clearing. Open on the point.
- Varied rhythm. Mix short and long sentences. Do not drone.
- No em dashes.
- Avoid the hyphen as a connector. Use a period or a comma instead. Compound
  words keep their hyphen (sub-task, brain-dump, client-side).
- Say what a thing does, plainly. No hype, no hedging.

## Anti-pattern checklist

Design must never regress past these. Check every view against the list before
done.

- No tiny fonts. Body text stays comfortably readable.
- No cramped spacing. Honor the spacing rhythm; let the layout breathe.
- No low contrast. Text and controls meet a clear contrast bar.
- No inconsistent rhythm. Spacing and type follow the scale, not ad hoc values.
- No more than one primary action per view. One clear next step, not a row of
  equal buttons.
