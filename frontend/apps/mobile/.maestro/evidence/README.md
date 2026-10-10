# Maestro evidence

Frames kept on purpose, one composite per claim that a flow's pass/fail cannot carry (Maestro
counts an element under the keyboard as visible). Each file is named after its ticket and says in
its caption what was measured.

- `pad569-keyboard-2x2.png` — PAD-569 / B-462, flow 240 with the keyboard open: staging's screen
  (left, content shift 0 px, fillers 36–40 under the keyboard) vs the branch (right, content shift
  822 px, filler 40 above the composer). Red line: the composer's top edge, y = 1543 px in both.
  Measured by `measure569.py` here (Pillow + numpy + tesseract; point `E` at a folder holding
  the four `pad569-*` frames and the four `control-pad569-*` frames from a flow-240 run on each
  build): content shift = the vertical offset at which the blue-bubble row profile of the
  keyboard-open frame best matches the at-bottom frame; composer top = first row of the light-grey
  input box.
