# Tasks

Queue of work for Claude. Add new tasks to the bottom. Do not remove or edit an
unchecked task unless you are starting it.

## Rules
- Work on only one task at a time.
- New tasks go at the bottom of the list.
- Do not abandon or interrupt the current task unless the user explicitly says "interrupt".
- Finish, test, and verify the current task before starting the next.
- Before starting another task, re-read this file and select the oldest pending (unchecked) task.
- After completing a task, check it off, briefly tell the user it's done, and state which task is starting next.
- Do not combine unrelated tasks into one implementation.

## Queue

- [ ] Fix whole variant bug (see ### wholevariantbug)
- [ ] Should show variants of products just like regular shop page... or at least NOT as 2+ versions of the same product... thats bad UX
- [ ] When I clicked return to cart from the Shopify order page, it brought me to this URL, which again, no one should be able to access  https://cfcskincare.myshopify.com/cart

### wholevariantbug
A separate bug I found on the way

wholesale-core.ts:361 does const variant = product.variants.nodes[0] — it takes only the first variant. But these products have two:

┌────────────────────────────┬─────────────────────────┐
│          Product           │        Variants         │
├────────────────────────────┼─────────────────────────┤
│ Color Correction C&E Serum │ 18 oz. $720, 8 oz. $360 │
├────────────────────────────┼─────────────────────────┤
│ Pure Hydration HA Serum    │ 18 oz. $360, 8 oz. $180 │
└────────────────────────────┴─────────────────────────┘

Your wholesale grid can only ever sell the 18 oz. The 8 oz is unreachable. That matches your screenshots — both show "18 oz." Worth fixing once checkout works, though it's independent of the catalog issue.