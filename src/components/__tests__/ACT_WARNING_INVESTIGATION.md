# act(...) Warning Investigation Log

**File under investigation:** `src/components/__tests__/SharePriceDashboard.test.jsx`  
**Stack:** React 19.2, RTL 16.3, Vitest 3.2, JSDOM, `@testing-library/user-event` 14  
**Symptom:** All 13 tests pass, but every test emits two `act(...)` warnings to stderr:

```
An update to Root inside a test was not wrapped in act(...)
An update to SharePriceDashboard inside a test was not wrapped in act(...)
```

The two warnings per test are both from the **same** state update — React 19 emits one warning for the React root node and one for the component. They do not represent two separate problems.

---

## Confirmed Root Causes

### 1. `flushSync` does not flush passive effects inside `act`

`mountDashboard` uses `flushSync(() => { root.render(ui) })`. `flushSync` processes layout effects (`useLayoutEffect`) synchronously, but schedules passive effects (`useEffect`) as microtasks via React 19's scheduler. Those microtasks run **after** `flushSync` returns, outside any `act` boundary. The `useMediaQueryMatch` hook calls `setMatches(...)` inside its `useEffect`, triggering a state update outside `act`. This produces the consistent 2-per-test warning pattern.

### 2. Scale animation `setTimeout(fn, 0/160)` fires outside `act`

In `SharePriceDashboard.jsx`, the scale animation uses:
```js
contractionTimeoutRef.current = window.setTimeout(animateToScale, transitionDelay);
```
`transitionDelay` is `0` (expanding scale) or `160` (contracting). Both fire as real macrotasks after the current `act` scope completes. When they fire, `animateToScale` calls `requestAnimationFrame(step)`, and `step` calls `setRenderedScale(...)` — all outside `act`.

### 3. The rAF mock fires as macrotasks (original design)

The original mock backed `requestAnimationFrame` with `window.setTimeout(cb, 0)`. Since `act` does not drain macrotasks, the rAF callbacks fire outside any `act` scope, causing their `setScrollState`/`setRenderedScale` calls to produce warnings.

---

## What Was Tried in This Session (All Failed)

### Attempt 1: Replace `createRoot`/`flushSync` with RTL `render`/`rerender`

**What was changed:**
- Removed `flushSync`, `createRoot` imports
- Added `render` from `@testing-library/react`
- `mountDashboard` became `const rtlResult = render(ui)`

**Result:** **Hang.** The test process printed `RUN v3.2.4` and then produced no further output after 90+ seconds.

**Why it hangs:** RTL 16's `render()` for React 19 uses async internals. When combined with the original `window.setTimeout`-backed rAF mock (which ran `setTimeout(cb, 0)`), or when combined with any timer mocking, RTL's async flushing got stuck.

---

### Attempt 2: `vi.useFakeTimers()` + RTL `render` + synchronous `act(() => { vi.advanceTimersByTime(N) })`

**What was changed:**
- Added `vi.useFakeTimers()` to `beforeEach`
- `vi.useRealTimers()` in `afterEach`
- `flushDashboardWork` advanced fake time with `act(() => { vi.advanceTimersByTime(550) })`
- `mountDashboard` used RTL `render`
- `userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })`

**Result:** **Hang** (same as Attempt 1 — RTL + anything async = hang).

---

### Attempt 3: `vi.useFakeTimers()` + `createRoot` + async `act(() => { vi.advanceTimersByTime(N) })`

**What was changed:**
- Kept `createRoot`/`flushSync` harness
- Added `vi.useFakeTimers()` to `beforeEach`
- `flushDashboardWork` used `await act(async () => { vi.advanceTimersByTime(550); await Promise.resolve(); })`

**Result:** **Hang.**

**Why it hangs:** React 19's async `act()` uses `setTimeout(fn, 0)` internally to flush its own work queue (specifically in the `flushActQueue` path). When `vi.useFakeTimers()` is active, that internal `setTimeout(fn, 0)` is faked and **never fires**, so `await act(async () => { ... })` never resolves.

**Key finding:** `vi.useFakeTimers()` + `await act(async ...)` is a broken combination in React 19 + Vitest. The hang is not in the test code itself but in React's internal async act machinery.

---

### Attempt 4: `vi.useFakeTimers()` + `createRoot` + **synchronous** `act(() => { vi.advanceTimersByTime(N) })`

**What was changed:**
- Kept fake timers
- Changed timer advancement to use synchronous `act(() => { vi.advanceTimersByTime(N) })` (not async)
- Other `await act(async () => { ... })` calls remained async

**Result:** **Hang.**

**Why:** The hang was not only in the `vi.advanceTimersByTime` act call. The first `await act(async () => { deferredResponse.resolveResponse(payload); })` in `renderDashboard` also hangs, for the same reason: async act uses `setTimeout(fn, 0)` internally, which is faked.

---

### Attempt 5: `queueMicrotask`-backed rAF mock + RTL `render` (no fake timers)

**What was changed:**
- No `vi.useFakeTimers()`
- rAF mock used `queueMicrotask(cb)` instead of `window.setTimeout(cb, 0)`
- Small-delay `window.setTimeout` mock (delays ≤ 200ms) also used `queueMicrotask`
- `flushDashboardWork` used `await act(async () => { for 12 × Promise.resolve() })`
- `mountDashboard` used RTL `render`

**Result:** **Hang.**

**Why:** RTL 16's `render()` hangs regardless of the timer approach. The hang appears to be inside RTL's internal async processing path, not in React's act or our mocks. RTL was not the right harness for this component.

---

### Attempt 6: `queueMicrotask`-backed rAF + `window.setTimeout` mock + `createRoot` + `flushSync` (no async act for mount)

**What was changed:**
- Reverted to `createRoot`/`flushSync` for mounting
- rAF mock used `queueMicrotask`
- `window.setTimeout` for delays ≤ 200ms used `queueMicrotask`
- `globalThis.setTimeout = window.setTimeout` (to cover bare `setTimeout(...)` calls)
- `flushDashboardWork`: `await act(async () => { 12 × Promise.resolve() })`

**Result:** Tests **pass**, warnings **still present** (2 per test).

**Why warnings remain:** `flushSync` doesn't run passive effects inside `act`. The `useMediaQueryMatch` `setMatches` call fires after `flushSync` returns, outside `act`. Since this is the consistent source, fixing it requires async act during mount.

**Key learning:** The `queueMicrotask`-backed rAF mock works correctly — rAF callbacks fired inside `flushDashboardWork` no longer produce warnings. The remaining warnings come specifically from `flushSync` not covering passive effects.

---

### Attempt 7: Same as Attempt 6 + async `mountDashboard` using `await act(async () => { root.render(ui) })`

**What was changed:**
- `mountDashboard` became async: `await act(async () => { mountedRoot.render(ui); await Promise.resolve(); await Promise.resolve(); })`
- `renderDashboard` awaited `mountDashboard`
- `globalThis.setTimeout = window.setTimeout` remained in `beforeEach`

**Result:** **Hang.**

**Why:** `window === globalThis` in JSDOM. So `window.setTimeout = mockFn` automatically also sets `globalThis.setTimeout = mockFn`. React 19's async `act()` then hits our mock when it calls `setTimeout(fn, 0)` internally. The mock converts it to `queueMicrotask`, creating an infinite microtask loop or breaking React's internal flush-detection. This is the same hang as Attempt 3/4 but triggered differently.

---

### Attempt 8: Attempt 7 but removing `globalThis.setTimeout = window.setTimeout`

**What was changed:**
- Removed `globalThis.setTimeout = window.setTimeout` from `beforeEach`
- Added a comment explaining why

**Result:** **Hang** (still).

**Why:** Even without the explicit `globalThis.setTimeout` line, `window === globalThis` in JSDOM means `window.setTimeout = mockFn` already set `globalThis.setTimeout = mockFn` on the previous line. The removal of the explicit assignment doesn't help because the assignment was redundant — they're the same object.

**Key finding:** **In JSDOM you cannot replace `window.setTimeout` without also replacing `globalThis.setTimeout`/the bare global `setTimeout`.** Any `window.setTimeout = mockFn` in JSDOM affects ALL setTimeout callers, including React's async act internals. This makes it impossible to mock `setTimeout` for the component without breaking React's async act.

---

## Definitive Constraints for the Next Attempt

1. **RTL `render()` hangs with this component.** Do not use `@testing-library/react`'s `render()` as the mount harness. Use `createRoot` directly.

2. **`vi.useFakeTimers()` + `await act(async ...)` = hang.** React 19's async act uses `setTimeout(fn, 0)` internally. Faking `setTimeout` breaks async act. Never combine fake timers with async act in React 19.

3. **`window.setTimeout = mockFn` in JSDOM = hang.** In JSDOM, `window === globalThis`. Replacing `window.setTimeout` replaces the bare global `setTimeout` that React's async act uses. Any `window.setTimeout` mock with delay ≤ 0 will break async act.

4. **The `flushSync` + `createRoot` harness passes tests but cannot eliminate warnings.** `flushSync` doesn't run passive effects inside `act`. The `useMediaQueryMatch` passive effect fires after `flushSync` returns and produces warnings. This is the consistent 2-per-test source.

5. **`queueMicrotask`-backed rAF mock is safe and effective.** Replacing the original `window.setTimeout(cb, 0)`-backed rAF mock with `queueMicrotask(cb)` works correctly. rAF callbacks fire inside `act`'s microtask draining phase without hanging. This part of the fix is confirmed working.

6. **Async act with `createRoot` (no RTL) may work** — but only if `window.setTimeout` is NOT mocked. This combination was never fully tested in this session because the `window.setTimeout` mock was always active.

---

## The Unsolved Core Conflict

To fix the `useMediaQueryMatch` warning: passive effects must run inside `act`, which requires `await act(async () => { root.render(ui) })` for mounting.

To make async `act` work: `window.setTimeout` must NOT be mocked (because `window === globalThis` in JSDOM, and React 19's async act uses `setTimeout` internally).

To fix the scale animation warnings: `window.setTimeout(animateToScale, delay)` in the component must fire inside `act`, which requires either mocking it or faking global timers.

These three requirements are mutually exclusive given the current environment. A working solution must break the conflict. Candidate approaches for the next attempt:

**A. Product-code: make scale animation timing injectable.**
Add an `animationDuration` prop (defaulting to the real values) that tests pass as `0`. With duration `0`, `transitionDelay = 0` and `transitionDuration = 0` → `progress = 1` on the first rAF → the rAF callback causes only one state update. The `queueMicrotask`-backed rAF then handles it inside `act`. No `setTimeout` needed. The `useMediaQueryMatch` fix just needs async act for mount (no `window.setTimeout` mock required).

**B. Product-code: use `IS_TEST` environment flag to skip animation.**
`if (process.env.NODE_ENV === 'test') { setRenderedScale(targetChartScale); return; }` in the animation effect. Eliminates all timer-based animation work in tests. Combined with async act mounting, should eliminate all warnings.

**C. Use `vi.useFakeTimers({ toFake: [...exclude setTimeout...] })` and async act.**
Vitest's `vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })` fakes only rAF/cancelRaf, leaving `setTimeout` real. rAF advancement would need `vi.advanceTimersByTime` inside synchronous `act`. `setTimeout`-backed animations still fire outside act, but this might reduce warnings enough to be acceptable. **Not tested in this session.**

**D. Patch React 19's act to avoid the `setTimeout(fn, 0)` dependency.**
Not viable.

**E. Use a dedicated test environment that is NOT JSDOM.**
In a real browser environment (via Playwright/WebDriver), `window` and `globalThis` are not identical to Node.js's `global`. Mocking one doesn't break the other. Not viable for unit tests.
