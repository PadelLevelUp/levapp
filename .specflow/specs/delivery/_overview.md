# delivery — How changes reach production safely

## What this is

The delivery domain: the checks a change passes on its way from a pull request to production, where
they have behaviour worth specifying.

## What it covers

- `delivery.pr-e2e-subset` — implementing (PAD-511: on every PR into `staging`, run the web
  Playwright specs the change drives, bounded and advisory, with a second look at every red)

## Why it's grouped this way

These leaves describe the delivery pipeline, not the product. They sit in their own domain so a
product spec never depends on them and the product domains stay about coaches and students.

## Related groups

- `mobile/` holds the app's build targets (`mobile.release-build-target`); the Android CI lane is
  referenced from `mobile.android-runtime`.
