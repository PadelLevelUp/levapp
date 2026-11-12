"""The app's entry points into the new invitation engine (swap plan §3.1, §8 step 6; PAD-918).

Each function here is what a route or a service calls when the session it touches runs on the new
engine (``engine_switch.engine_for``): it turns the app's action into an engine request, runs it in
the session's unit (``engine_runner.engine``), and answers in the route's own shape.
"""
