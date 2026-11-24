---
about: "Prove a JS fix is in an ipa by grepping main.jsbundle for an identifier the fix adds (1 new, 0 old); an API name both bundles hold proves nothing"
permanence: stable
verified: "2026-11-20 (observed)"
origin:
  - session:1f2b6f85-3591-4547-8797-325a278a29e9
---

# Proving a JS fix is in the ipa

A release build that is "the previous build plus one fix" has to be shown to carry the fix before it is uploaded. The ipa is
a zip; the JavaScript is `Payload/LevApp.app/main.jsbundle`, minified but with string literals and property names intact.

- Pick an identifier the fix **adds**: a new field name, a new function or a new log string. Count it in the new bundle and in
  the previous build's bundle (`grep -acF '<identifier>' main.jsbundle`): 1 and 0 is the proof.
- An identifier the fix merely **uses** (an Expo API, a route path, a module name) counts in both bundles and proves nothing.
  The 1.3.5 check first grepped the Expo push-token API name, found it in both, and had to be redone with the field the fix
  introduced.
- Keep the previous build's ipa or archive to compare against; the archives folder outside the worktree holds them.

The same reading tells which capability tokens a build declares (`grep -acF <token> main.jsbundle`), which the promotion gate
needs (`code/github/promotion-gate.md`).

Filing: prove a JS fix in an ipa by an identifier the fix adds, counted in both bundles → code/mobile/proving-a-js-fix-is-in-the-ipa.md (origin: session:1f2b6f85-3591-4547-8797-325a278a29e9)
