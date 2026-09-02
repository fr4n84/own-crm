-- Backfill legacy lead Q&A rows with caller attribution.
-- Items that already carry authorRole are left untouched, making this idempotent.
-- down: no-op (legacy shape is no longer expected after deploy).

UPDATE leads l
SET questions = (
  SELECT jsonb_agg(
    elem || jsonb_build_object(
      'authorRole', 'caller',
      'authorId', l.caller_id
    )
  )
  FROM jsonb_array_elements(l.questions::jsonb) AS elem
  WHERE NOT (elem ? 'authorRole')
)
WHERE l.questions::jsonb <> '[]'::jsonb
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(l.questions::jsonb) elem
    WHERE NOT (elem ? 'authorRole')
  );
