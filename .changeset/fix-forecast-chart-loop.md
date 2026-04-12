---
"budgie": patch
---

Fix infinite render loop on forecast chart after recharts 3 upgrade. Stabilise tooltip content and cursor to module-level references, and disable the now-default accessibilityLayer whose unmount cleanup was dispatching into recharts' internal Redux store during teardown.
