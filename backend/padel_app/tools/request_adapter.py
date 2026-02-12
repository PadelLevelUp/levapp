from werkzeug.datastructures import MultiDict

class JsonRequestAdapter:
    """
    Minimal adapter to mimic Flask request interface
    for Field.set_value()
    """
    def __init__(self, data: dict, form=None):
        """
        Adapts JSON payload to behave like a Flask request
        compatible with input_tools.Form.set_values().
        """
        self._raw = data or {}

        if form:
            normalized = {}
            for field in form.fields:
                normalized[field.name] = self._raw.get(field.name, '')
        else:
            normalized = self._raw

        self.form = MultiDict(normalized)
        self.files = MultiDict()