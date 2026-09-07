# Evidence-first recommendation quality

Approved direction (2026-09-06): preserve the existing site UI and replace weak
recommendation criteria, not the application. No Vultr. No new paid collection
or default Bright Data use. Existing uncommitted work is outside this change.

## Acceptance criteria

1. Affiliate candidates cannot inherit a category's demand or a different
   query's SERP measurements. Unknown demand is not zero. Product availability,
   evidence dates, query identity and purchase relevance are explicit.
2. Ready/research/excluded are evidence states, not conversion probabilities.
   Only ready items are the default writing recommendations. Research and
   existing links stay inspectable; stale products cannot be ready.
3. Titles must not invent product performance, personal experience, reviews or
   scarcity. Each verified claim points to evidence. Unverified old titles do
   not silently become verified. A neutral planning title is labelled a draft.
4. Issue candidates must relate to the actual event/entity. Regressions include
   오늘의 운세 -> 오늘의 월드뉴스 and 리리아 3.5 -> 리리아나 보넷.
   No-demand candidates are observations, not recommendations. Apply the final
   gate to carried rows and old snapshots as well as newly generated rows.
5. Exact-title absence is not proof of weak competing content or guaranteed
   ranking. Display the measurement and its limitation, without outcome claims.
6. Preserve cards, navigation, platform access, copy/analyze functions and source
   data. Add concise evidence/rejection reasons; do not fabricate replacement rows.

## Delivery and verification

- Test real failure fixtures first, then implement pure gates and integration.
- Validate root tests, site tests/build, static data before/after and UI paths.
- Publish only scoped, reviewed changes with no secrets or unrelated edits.
- Performance feedback (published URL -> exposure/visits -> affiliate clicks ->
  reported orders/revenue) requires real user/account data and remains a separate
  integration phase. Do not label unmeasured conversions or success rates as fact.
- GA4 account linking and platform revenue permissions are not inferred from
  permission to change recommendation logic. Report any missing prerequisites.
