from werkzeug.datastructures import MultiDict

#: `legacy` — what every caller has always had: a field the body did not hold is filled
#: with '' and the form layer then reads any falsy value as "not sent" (B-136).
#: `present` — opt-in (PAD-367): the request holds a key if and only if the JSON body
#: held it, so "" / null can clear, 0 / false are values, and an absent key — a Boolean
#: included — is left alone. `Form.set_values` reads the mode from the request.
MODES = ("legacy", "present")


class JsonRequestAdapter:
    """
    Minimal adapter to mimic Flask request interface
    for Field.set_value()
    """
    def __init__(self, data: dict, form=None, mode="legacy"):
        """
        Adapts JSON payload to behave like a Flask request
        compatible with input_tools.Form.set_values().
        """
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}, not {mode!r}")
        if mode == "present" and not form:
            raise ValueError("present mode needs the form: it is what says which keys are fields")
        self._mode = mode
        self._raw = data or {}

        if mode == "present":
            # No '' filling. `present` is kept beside the MultiDict because a MultiDict
            # drops a key whose value is an empty list, and "[]" was sent.
            normalized = {
                field.name: self._raw[field.name]
                for field in form.fields
                if field.name in self._raw
            }
            self._present = frozenset(normalized)
        elif form:
            normalized = {}
            for field in form.fields:
                normalized[field.name] = self._raw.get(field.name, '')
        else:
            normalized = self._raw

        self.form = MultiDict(normalized)
        self.files = MultiDict()

    # The mode is fixed at construction and `present` exists only in present mode, so
    # the only way to read a request in present mode is the constructor keyword — the
    # one thing the call-site guard (test_pad385_adapter_call_sites.py) can see.
    @property
    def mode(self):
        return self._mode

    @property
    def present(self):
        if self._mode != "present":
            raise AttributeError("a legacy-mode request has no `present` set")
        return self._present
