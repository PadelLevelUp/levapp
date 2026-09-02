The calendar's only block type.

```jsx
<ClassBlock title="Aula 12" time="10:30 – 12:00" level="N4-" filled={7} capacity={16} status="needsFilling" />
```

Status drives the *whole* treatment — do not mix a status colour with a different fill colour. Only `needsFilling` is amber, so a week with holes is readable in one glance. Never colour a block by class level; level is the small mono chip.
