---
constants:
  MESSAGE_RECIPIENT_WINDOW_DAYS: 7
---

# admin constants

Facts more than one surface of the staff console must agree on.

- `MESSAGE_RECIPIENT_WINDOW_DAYS`: how far back the engine health page looks for a message a
  student received when it counts message recipients by push channel (`admin.engine-health`
  rule 13, PAD-789). The backend computes with it and sends it as `windowDays`; the page's label reads that. Rule 8a's
  active-student window is separate and is not this constant.
