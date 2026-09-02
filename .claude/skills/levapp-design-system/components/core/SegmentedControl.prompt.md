Switch between peer views of the same data.

```jsx
<SegmentedControl value={tab} onChange={setTab}
  options={[{value:"auto",label:"Automações"},{value:"chat",label:"Conversas",count:1}]} />
```

Max four segments. If you need more, it is a filter row of pills, not a segmented control.
