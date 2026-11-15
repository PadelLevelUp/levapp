# dashboard — Dynamic Dashboard

## What this is

The role-aware landing screen every coach and student sees on opening the app: a server-assembled
set of at-a-glance blocks, each linking through to the exact page and item it summarizes.

## What it covers

- `dashboard.user-relies-on-the-dashboard` — the dashboard's blocks and their deep-linking
  navigation, for both coach and student roles

## Why it's grouped this way

Both leaves describe one indivisible surface — a set of blocks (`dashboard.blocks`) is only useful
because each one navigates somewhere real (`dashboard.navigation`); no user experiences assembling
the dashboard separately from clicking through it, so they're one outcome.
