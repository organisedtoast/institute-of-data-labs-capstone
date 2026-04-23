# `act(...)` Warning Investigation Log

**File under investigation:** `src/components/__tests__/SharePriceDashboard.test.jsx`  
**Stack:** React 19.2, RTL 16.3, Vitest 3.2, JSDOM, `@testing-library/user-event` 14

## Current status

This note started when the `SharePriceDashboard` test file passed but still printed:

```text
An update to Root inside a test was not wrapped in act(...)
An update to SharePriceDashboard inside a test was not wrapped in act(...)
```

The important beginner takeaway is that a passing test file can still have a bad
test harness. React prints these warnings when some state updates happen outside
the normal test lifecycle, which makes future regressions more likely to become
flaky, timing-sensitive, or hard to debug.

## Final repo truth

The final fix lives in the **test harness**, not in the production component:

1. `useMediaQueryMatch` now uses `useSyncExternalStore` in
   `src/components/SharePriceDashboard.jsx`. Earlier notes that blamed a passive
   `useEffect` media-query update are now historical context, not the final live
   diagnosis.
2. The custom `createRoot` harness was mounting and rerendering with
   `flushSync(...)` instead of `act(...)`. That let React work escape the normal
   test boundary.
3. The mocked `requestAnimationFrame` used `window.setTimeout(..., 0)`, which
   pushed rAF callbacks into later macrotasks. Those callbacks then fired
   outside the current `act(...)` scope and produced warnings.
4. The final fix keeps **real** `setTimeout` untouched, wraps
   `root.render(...)`/rerender in synchronous `act(...)`, and backs the rAF mock
   with `queueMicrotask(...)` plus explicit cancel support.

## What finally worked

### 1. Synchronous `act(...)` around `createRoot`

`SharePriceDashboard.test.jsx` still uses `createRoot`, but the helper now does:

```js
act(() => {
  mountedRoot.render(ui);
});
```

and the same for rerender.

This keeps React's own work inside a proper test boundary without switching to
RTL's `render()`, which had already proved unstable for this component stack.

### 2. `queueMicrotask`-backed rAF mock

The safe mock shape is:

```js
window.requestAnimationFrame = (callback) => {
  const handle = nextAnimationFrameHandle++;
  pendingAnimationFrameHandles.add(handle);

  queueMicrotask(() => {
    if (!pendingAnimationFrameHandles.has(handle)) {
      return;
    }

    pendingAnimationFrameHandles.delete(handle);
    callback(window.performance.now());
  });

  return handle;
};
```

Why this works:

- `act(...)` drains microtasks as part of the current test step.
- A `setTimeout(..., 0)`-backed rAF escapes into a later task.
- That later task is exactly what caused the warning noise.

### 3. Real timers stayed real

The file does **not** mock `window.setTimeout`.

That is intentional. In JSDOM, `window === globalThis`, so replacing
`window.setTimeout` also replaces the global `setTimeout` React 19 uses
internally during async work. Earlier attempts showed that mocking timers here
caused hangs.

## Historical dead ends that should not be retried casually

These findings are still useful constraints:

1. **RTL `render()` was not the right harness here.** Earlier experiments with
   `@testing-library/react`'s `render()` hung for this component stack.
2. **Fake timers plus async `act(...)` caused hangs.** React 19 relies on
   timer-based internal flushing, so `vi.useFakeTimers()` was not a safe fit for
   this file.
3. **Mocking `window.setTimeout` in JSDOM is dangerous.** Because `window` and
   `globalThis` are the same object here, mocking one mocks both.

## Regression coverage added to keep the fix alive

The test file now includes narrow `console.error` regressions that assert the
default dashboard load and the metrics-open path do **not** emit the specific
`act(...)` warning text.

That means the harness itself is now under test, not just the UI behavior.

## Practical guidance for future edits

If you need to touch this test file again:

- keep `createRoot`
- keep mount/rerender inside `act(...)`
- keep real `setTimeout`
- keep the rAF mock microtask-backed
- if a warning comes back, capture the exact stderr text first before changing
  timers or swapping harness libraries
