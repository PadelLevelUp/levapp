# Spec File Schema

This skill uses the same spec schema as specflow-new-project. Read the canonical version at:
`../.claude/skills/specflow-new-project/references/spec-schema.md`

If that file is not available, the key points are:

## Leaf Spec Structure
- **id:** domain.capability.leaf (dot-notation matching directory path)
- **status:** draft | implementing | implemented
- **depends_on:** comma-separated spec IDs or "none"
- **Intent:** 1-2 sentences on why this spec exists
- **Entities:** Only if this spec introduces new data entities (defined once, referenced elsewhere)
- **Rules:** Numbered behavioral rules in plain language
- **Acceptance Criteria:** Given/When/Then with concrete values, one named criterion per behavior
- **Notes:** Optional. Prefix open questions with OPEN:

## Onboarding-specific status rules
- Specs for working, human-approved code: `implemented`
- Specs for code with known bugs: `draft` (needs reimplementation)
- Specs where intent is unclear: `draft` with `OPEN:` note
