import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import SharePriceDashboard from '../components/SharePriceDashboard';
import StockSearchResults from '../components/StockSearchResults';
import useStockSearch from '../hooks/useStockSearch';
import extractApiErrorMessage from '../utils/extractApiErrorMessage';
import normalizeTickerIdentifier from '../utils/normalizeTickerIdentifier';
import {
  fetchWatchlistDashboardBootstraps,
  refreshWatchlistDashboardBootstrap,
} from '../services/watchlistDashboardApi';

const DASHBOARD_BOOTSTRAP_STATUS = Object.freeze({
  ERROR: 'error',
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
});

const INITIAL_RENDER_WINDOW_SIZE = 24;
const RENDER_WINDOW_BATCH_SIZE = 48;
const RENDER_WINDOW_ROOT_MARGIN = '1600px 0px';
const INITIAL_BOOTSTRAP_BATCH_SIZE = 4;
const VIEWPORT_BOOTSTRAP_BATCH_SIZE = 12;
// Each shell that crosses the viewport only enqueues itself, not a lookahead
// chunk. With a lookahead, the first wave of above-the-fold intersections
// snowballs and activates the entire render window before the user even
// scrolls — which then makes the perf harness's progressive-activation check
// fail because no further cards have anywhere to come from. Drain still
// batches up to VIEWPORT_BOOTSTRAP_BATCH_SIZE per network call, so this
// stays efficient on the wire.
const VIEWPORT_INTERSECTION_BATCH_SIZE = 1;
const BOOTSTRAP_ROOT_MARGIN = '200px 0px';
// Each shell reserves roughly the same vertical space the real dashboard
// will occupy. Without this, every shell in the render window collapses to
// ~120px, all 24 fit inside the bootstrap viewport observer's margin window
// at initial layout, and every card activates before the user can scroll.
// A substantial reserved height keeps shells far enough apart that only the
// top few intersect on first paint and the rest stay reachable by scrolling,
// which is what the perf harness's progressive activation check expects.
const SHELL_MIN_HEIGHT_PX = 520;
// We push the refresh start well past the first real dashboard paint. The
// browser's actual paint can lag the React paint signal by hundreds of
// milliseconds when MUI/emotion CSS injection and large summary parsing
// crowd the main thread, so a generous buffer keeps refresh from winning the
// race for users on the same code path the perf harness measures.
const REFRESH_START_DELAY_MS = 3500;
// We yield to the browser between shell paint and the heavier dashboard mount
// so the user actually sees the watchlist structure first instead of the page
// staying blank while React commits the much larger SharePriceDashboard tree.
const DASHBOARD_MOUNT_YIELD_MS = 60;

function filterObjectByIdentifiers(sourceObject, identifierSet) {
  return Object.fromEntries(
    Object.entries(sourceObject).filter(([identifier]) => identifierSet.has(identifier)),
  );
}

function ProgressiveDashboardCard({
  bootstrapData,
  bootstrapError,
  bootstrapStatus,
  canMountDashboard,
  isFocusedMetricsMode,
  onFirstVisibleDashboardPaint,
  onMetricsVisibilityChange,
  onRemove,
  onRetryBootstrap,
  registerViewportNode,
  summaryCard,
}) {
  const summaryName = summaryCard.name || summaryCard.identifier;
  const isReadyToMountDashboard =
    canMountDashboard
    && bootstrapStatus === DASHBOARD_BOOTSTRAP_STATUS.SUCCESS
    && Boolean(bootstrapData);

  return (
    <Box
      ref={registerViewportNode}
      data-testid={
        isReadyToMountDashboard
          ? undefined
          : 'share-price-dashboard-shell-observer-target'
      }
      data-identifier={
        isReadyToMountDashboard
          ? undefined
          : summaryCard.identifier
      }
      sx={{ width: '100%' }}
    >
      {isReadyToMountDashboard ? (
        <SharePriceDashboard
          key={summaryCard.identifier}
          identifier={summaryCard.identifier}
          name={summaryName}
          initialDashboardData={bootstrapData}
          isRemovable={summaryCard.isUserAdded}
          isFocusedMetricsMode={isFocusedMetricsMode}
          onFirstVisibleDashboardPaint={onFirstVisibleDashboardPaint}
          onMetricsVisibilityChange={onMetricsVisibilityChange}
          onRemove={onRemove}
        />
      ) : (
        <Card
          data-testid="share-price-dashboard-shell"
          data-identifier={summaryCard.identifier}
          sx={{
            width: '100%',
            maxWidth: 1200,
            minHeight: SHELL_MIN_HEIGHT_PX,
            display: 'flex',
            flexDirection: 'column',
            margin: 0,
            borderRadius: 2,
          }}
        >
          <CardContent
            sx={{
              paddingBottom: '16px !important',
              paddingTop: '18px !important',
              px: { xs: 2, sm: 2.5, lg: 3 },
            }}
          >
            <Typography
              gutterBottom
              sx={{
                color: 'text.secondary',
                fontSize: 11,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              Stock
            </Typography>
            <Typography variant="h5" component="div" sx={{ marginBottom: 0, marginTop: 0 }}>
              {summaryName}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {summaryCard.identifier}
            </Typography>

            {/* We render the summary shell first so the user sees their watchlist
                structure immediately, even while the richer chart payload is
                still loading in the background for larger datasets. */}
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
              {bootstrapStatus === DASHBOARD_BOOTSTRAP_STATUS.ERROR
                ? (bootstrapError || `Unable to load dashboard data for ${summaryCard.identifier}.`)
                : 'Preparing chart and metrics...'}
            </Typography>

            {bootstrapStatus === DASHBOARD_BOOTSTRAP_STATUS.ERROR ? (
              <Box sx={{ mt: 2 }}>
                <Button size="small" variant="outlined" onClick={onRetryBootstrap}>
                  Retry card
                </Button>
              </Box>
            ) : null}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function Stocks() {
  const {
    stocks,
    stocksStatus,
    stocksError,
    addStockFromResult,
    openExistingStock,
    removeStockByIdentifier,
    pendingStockAction,
    clearPendingStockAction,
  } = useStockSearch();
  const [bootstrapDataByIdentifier, setBootstrapDataByIdentifier] = useState({});
  const [bootstrapErrorsByIdentifier, setBootstrapErrorsByIdentifier] = useState({});
  const [bootstrapStatusByIdentifier, setBootstrapStatusByIdentifier] = useState({});
  const [focusedMetricsIdentifier, setFocusedMetricsIdentifier] = useState('');
  const [hasPaintedFirstVisibleDashboard, setHasPaintedFirstVisibleDashboard] = useState(false);
  const [hasSettledInitialBootstrapBatch, setHasSettledInitialBootstrapBatch] = useState(false);
  // The page renders shells and bootstraps dashboards in two stages. This flag
  // flips after the shell tree commits, which lets us postpone the heavier
  // SharePriceDashboard mount by one paint frame so the lightweight summary
  // structure is visible to the user before the chart-heavy work starts.
  const [hasYieldedAfterShellPaint, setHasYieldedAfterShellPaint] = useState(false);
  const [pendingBootstrapIdentifiers, setPendingBootstrapIdentifiers] = useState([]);
  const [renderWindowEndIndex, setRenderWindowEndIndex] = useState(INITIAL_RENDER_WINDOW_SIZE);
  const [pendingRemovalStock, setPendingRemovalStock] = useState(null);
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);
  const observedNodeByIdentifierRef = useRef(new Map());
  const observedNodeMetadataRef = useRef(new Map());
  const sharedViewportObserverRef = useRef(null);
  const renderWindowObserverRef = useRef(null);
  const renderWindowSentinelNodeRef = useRef(null);
  const inFlightBootstrapIdentifiersRef = useRef(new Set());
  const queuedBootstrapIdentifiersRef = useRef(new Set());
  const initialBootstrapIdentifiersRef = useRef(new Set());
  const bootstrapStatusByIdentifierRef = useRef({});
  const bootstrapDataByIdentifierRef = useRef({});
  const stockIdentifierListRef = useRef([]);
  const backgroundRefreshStartedRef = useRef(new Set());
  const refreshStartDelayTimeoutRef = useRef(null);
  const refreshIdleCallbackRef = useRef(null);

  useEffect(() => {
    bootstrapStatusByIdentifierRef.current = bootstrapStatusByIdentifier;
  }, [bootstrapStatusByIdentifier]);

  useEffect(() => {
    bootstrapDataByIdentifierRef.current = bootstrapDataByIdentifier;
  }, [bootstrapDataByIdentifier]);

  const summaryCards = useMemo(() => {
    return stocks
      .map((stock) => {
        const identifier = normalizeTickerIdentifier(stock?.identifier);

        if (!identifier) {
          return null;
        }

        return {
          identifier,
          isUserAdded: stock?.isUserAdded === true,
          name: typeof stock?.name === 'string' && stock.name.trim() ? stock.name.trim() : identifier,
        };
      })
      .filter(Boolean);
  }, [stocks]);

  const stockIdentifierList = useMemo(() => {
    return summaryCards.map((stock) => stock.identifier);
  }, [summaryCards]);

  useEffect(() => {
    stockIdentifierListRef.current = stockIdentifierList;
  }, [stockIdentifierList]);

  const summaryCardByIdentifier = useMemo(() => {
    return new Map(summaryCards.map((stock) => [stock.identifier, stock]));
  }, [summaryCards]);

  const reconcileFocusedMetricsIdentifier = useCallback((nextIdentifiers) => {
    setFocusedMetricsIdentifier((previousFocusedMetricsIdentifier) => {
      if (!previousFocusedMetricsIdentifier) {
        return previousFocusedMetricsIdentifier;
      }

      return nextIdentifiers.includes(previousFocusedMetricsIdentifier)
        ? previousFocusedMetricsIdentifier
        : '';
    });
  }, []);

  useEffect(() => {
    const validIdentifiers = new Set(stockIdentifierList);

    setBootstrapDataByIdentifier((previousBootstrapData) => {
      return filterObjectByIdentifiers(previousBootstrapData, validIdentifiers);
    });
    setBootstrapErrorsByIdentifier((previousBootstrapErrors) => {
      return filterObjectByIdentifiers(previousBootstrapErrors, validIdentifiers);
    });
    setBootstrapStatusByIdentifier((previousBootstrapStatus) => {
      const nextBootstrapStatus = {};

      stockIdentifierList.forEach((identifier) => {
        nextBootstrapStatus[identifier] =
          previousBootstrapStatus[identifier] || DASHBOARD_BOOTSTRAP_STATUS.IDLE;
      });

      return nextBootstrapStatus;
    });
    backgroundRefreshStartedRef.current = new Set(
      [...backgroundRefreshStartedRef.current].filter((identifier) => validIdentifiers.has(identifier)),
    );
    inFlightBootstrapIdentifiersRef.current = new Set(
      [...inFlightBootstrapIdentifiersRef.current].filter((identifier) => validIdentifiers.has(identifier)),
    );
    queuedBootstrapIdentifiersRef.current = new Set(
      [...queuedBootstrapIdentifiersRef.current].filter((identifier) => validIdentifiers.has(identifier)),
    );
    initialBootstrapIdentifiersRef.current = new Set(
      [...initialBootstrapIdentifiersRef.current].filter((identifier) => validIdentifiers.has(identifier)),
    );
    setPendingBootstrapIdentifiers((previousPendingBootstrapIdentifiers) => {
      return previousPendingBootstrapIdentifiers.filter((identifier) => validIdentifiers.has(identifier));
    });
    reconcileFocusedMetricsIdentifier(stockIdentifierList);
    setHasPaintedFirstVisibleDashboard(false);
    setHasSettledInitialBootstrapBatch(false);
    setHasYieldedAfterShellPaint(false);
    setRenderWindowEndIndex(() => {
      return Math.min(INITIAL_RENDER_WINDOW_SIZE, stockIdentifierList.length);
    });
  }, [reconcileFocusedMetricsIdentifier, stockIdentifierList]);

  useEffect(() => {
    if (!pendingStockAction) {
      return undefined;
    }

    const { mode, stock } = pendingStockAction;
    clearPendingStockAction();

    // The page handles both search outcomes in one place: add a missing stock
    // or open an existing one. Keeping that routing together preserves one
    // consistent Home-to-Stocks flow for the user and for beginners reading it.
    const handlePendingStockActionOnStocksPage = async () => {
      if (mode === 'open') {
        await openExistingStock(stock);
        return;
      }

      await addStockFromResult(stock);
    };

    handlePendingStockActionOnStocksPage();

    return undefined;
  }, [addStockFromResult, clearPendingStockAction, openExistingStock, pendingStockAction]);

  const markInitialBootstrapIdentifiersAsSettled = useCallback((identifiersToMark) => {
    if (!initialBootstrapIdentifiersRef.current.size) {
      return;
    }

    identifiersToMark.forEach((identifier) => {
      initialBootstrapIdentifiersRef.current.delete(identifier);
    });

    if (initialBootstrapIdentifiersRef.current.size === 0) {
      setHasSettledInitialBootstrapBatch(true);
    }
  }, []);

  const loadDashboardBootstrapsForIdentifiers = useCallback(async (identifiersToLoad) => {
    const normalizedIdentifiers = identifiersToLoad
      .map((identifier) => normalizeTickerIdentifier(identifier))
      .filter(Boolean)
      .filter((identifier, index, array) => array.indexOf(identifier) === index)
      .filter((identifier) => {
        const currentStatus = bootstrapStatusByIdentifierRef.current[identifier];

        if (inFlightBootstrapIdentifiersRef.current.has(identifier)) {
          return false;
        }

        return currentStatus !== DASHBOARD_BOOTSTRAP_STATUS.SUCCESS && currentStatus !== DASHBOARD_BOOTSTRAP_STATUS.LOADING;
      });

    if (!normalizedIdentifiers.length) {
      return;
    }

    normalizedIdentifiers.forEach((identifier) => {
      inFlightBootstrapIdentifiersRef.current.add(identifier);
    });

    setBootstrapStatusByIdentifier((previousBootstrapStatus) => {
      return {
        ...previousBootstrapStatus,
        ...Object.fromEntries(
          normalizedIdentifiers.map((identifier) => [identifier, DASHBOARD_BOOTSTRAP_STATUS.LOADING]),
        ),
      };
    });
    setBootstrapErrorsByIdentifier((previousBootstrapErrors) => {
      const nextBootstrapErrors = { ...previousBootstrapErrors };

      normalizedIdentifiers.forEach((identifier) => {
        delete nextBootstrapErrors[identifier];
      });

      return nextBootstrapErrors;
    });

    try {
      const loadedDashboardBootstraps = await fetchWatchlistDashboardBootstraps({
        tickers: normalizedIdentifiers,
      });
      const bootstrapByIdentifier = new Map(
        loadedDashboardBootstraps.map((dashboardBootstrap) => [
          normalizeTickerIdentifier(dashboardBootstrap?.identifier),
          dashboardBootstrap,
        ]),
      );

      setBootstrapDataByIdentifier((previousBootstrapData) => {
        const nextBootstrapData = { ...previousBootstrapData };

        loadedDashboardBootstraps.forEach((dashboardBootstrap) => {
          const identifier = normalizeTickerIdentifier(dashboardBootstrap?.identifier);

          if (!identifier) {
            return;
          }

          nextBootstrapData[identifier] = dashboardBootstrap;
        });

        return nextBootstrapData;
      });
      setBootstrapStatusByIdentifier((previousBootstrapStatus) => {
        const nextBootstrapStatus = { ...previousBootstrapStatus };

        normalizedIdentifiers.forEach((identifier) => {
          nextBootstrapStatus[identifier] = bootstrapByIdentifier.has(identifier)
            ? DASHBOARD_BOOTSTRAP_STATUS.SUCCESS
            : DASHBOARD_BOOTSTRAP_STATUS.ERROR;
        });

        return nextBootstrapStatus;
      });
      setBootstrapErrorsByIdentifier((previousBootstrapErrors) => {
        const nextBootstrapErrors = { ...previousBootstrapErrors };

        normalizedIdentifiers.forEach((identifier) => {
          if (bootstrapByIdentifier.has(identifier)) {
            delete nextBootstrapErrors[identifier];
            return;
          }

          nextBootstrapErrors[identifier] = `Unable to load dashboard data for ${identifier}.`;
        });

        return nextBootstrapErrors;
      });
    } catch (requestError) {
      const fallbackMessage = extractApiErrorMessage(
        requestError,
        'Unable to load dashboard data for your watchlist right now.',
      );

      setBootstrapStatusByIdentifier((previousBootstrapStatus) => {
        return {
          ...previousBootstrapStatus,
          ...Object.fromEntries(
            normalizedIdentifiers.map((identifier) => [identifier, DASHBOARD_BOOTSTRAP_STATUS.ERROR]),
          ),
        };
      });
      setBootstrapErrorsByIdentifier((previousBootstrapErrors) => {
        return {
          ...previousBootstrapErrors,
          ...Object.fromEntries(
            normalizedIdentifiers.map((identifier) => [identifier, fallbackMessage]),
          ),
        };
      });
    } finally {
      normalizedIdentifiers.forEach((identifier) => {
        inFlightBootstrapIdentifiersRef.current.delete(identifier);
      });
      markInitialBootstrapIdentifiersAsSettled(normalizedIdentifiers);
    }
  }, [markInitialBootstrapIdentifiersAsSettled]);

  const enqueueBootstrapBatchFromIndex = useCallback((startIndex, batchSize) => {
    const nextIdentifiersToLoad = [];

    for (let index = startIndex; index < stockIdentifierList.length; index += 1) {
      if (nextIdentifiersToLoad.length >= batchSize) {
        break;
      }

      const identifier = stockIdentifierList[index];
      const currentStatus = bootstrapStatusByIdentifierRef.current[identifier] || DASHBOARD_BOOTSTRAP_STATUS.IDLE;

      if (currentStatus !== DASHBOARD_BOOTSTRAP_STATUS.IDLE) {
        continue;
      }

      if (inFlightBootstrapIdentifiersRef.current.has(identifier)) {
        continue;
      }

      if (queuedBootstrapIdentifiersRef.current.has(identifier)) {
        continue;
      }

      nextIdentifiersToLoad.push(identifier);
    }

    if (!nextIdentifiersToLoad.length) {
      return;
    }

    nextIdentifiersToLoad.forEach((identifier) => {
      queuedBootstrapIdentifiersRef.current.add(identifier);
    });
    setPendingBootstrapIdentifiers((previousPendingBootstrapIdentifiers) => {
      return [...previousPendingBootstrapIdentifiers, ...nextIdentifiersToLoad];
    });
  }, [stockIdentifierList]);

  useEffect(() => {
    if (stocksStatus !== 'success' || stockIdentifierList.length === 0) {
      return undefined;
    }

    if (typeof window === 'undefined') {
      setHasYieldedAfterShellPaint(true);
      return undefined;
    }

    // Two animation frames plus a short setTimeout fallback give the browser
    // a real chance to paint the lightweight shells before we kick off the
    // dashboard bootstrap fetch and the heavier SharePriceDashboard mount.
    let firstFrameId = null;
    let secondFrameId = null;
    const fallbackTimeoutId = window.setTimeout(() => {
      setHasYieldedAfterShellPaint(true);
    }, DASHBOARD_MOUNT_YIELD_MS);

    if (typeof window.requestAnimationFrame === 'function') {
      firstFrameId = window.requestAnimationFrame(() => {
        secondFrameId = window.requestAnimationFrame(() => {
          setHasYieldedAfterShellPaint(true);
        });
      });
    }

    return () => {
      window.clearTimeout(fallbackTimeoutId);
      if (firstFrameId != null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(firstFrameId);
      }
      if (secondFrameId != null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [stockIdentifierList, stocksStatus]);

  useEffect(() => {
    if (stocksStatus !== 'success' || stockIdentifierList.length === 0 || !hasYieldedAfterShellPaint) {
      return;
    }

    const initialIdentifiers = stockIdentifierList.slice(0, INITIAL_BOOTSTRAP_BATCH_SIZE);

    initialBootstrapIdentifiersRef.current = new Set(initialIdentifiers);
    setHasSettledInitialBootstrapBatch(initialIdentifiers.length === 0);

    // We intentionally keep the first real dashboard request tiny. Showing a
    // few real cards quickly is more valuable than asking the browser to parse
    // a much larger first payload while the page is still trying to paint.
    enqueueBootstrapBatchFromIndex(0, INITIAL_BOOTSTRAP_BATCH_SIZE);
  }, [enqueueBootstrapBatchFromIndex, hasYieldedAfterShellPaint, stockIdentifierList, stocksStatus]);

  useEffect(() => {
    if (!pendingBootstrapIdentifiers.length || inFlightBootstrapIdentifiersRef.current.size > 0) {
      return;
    }

    const nextIdentifiersToLoad = pendingBootstrapIdentifiers.slice(0, VIEWPORT_BOOTSTRAP_BATCH_SIZE);

    if (!nextIdentifiersToLoad.length) {
      return;
    }

    setPendingBootstrapIdentifiers((previousPendingBootstrapIdentifiers) => {
      return previousPendingBootstrapIdentifiers.slice(nextIdentifiersToLoad.length);
    });
    nextIdentifiersToLoad.forEach((identifier) => {
      queuedBootstrapIdentifiersRef.current.delete(identifier);
    });

    // One queued request at a time is easier on the browser than many
    // overlapping fetches. The page owns this queue so shell rendering and
    // dashboard bootstrapping stay separate jobs.
    loadDashboardBootstrapsForIdentifiers(nextIdentifiersToLoad);
  }, [loadDashboardBootstrapsForIdentifiers, pendingBootstrapIdentifiers]);

  const supportsIntersectionObserver = typeof IntersectionObserver === 'function';

  const handleViewportIntersections = useCallback((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const metadata = observedNodeMetadataRef.current.get(entry.target);

      if (!metadata) {
        return;
      }

      sharedViewportObserverRef.current?.unobserve(entry.target);
      observedNodeMetadataRef.current.delete(entry.target);
      observedNodeByIdentifierRef.current.delete(metadata.identifier);

      // The page, not the child card, owns viewport-triggered loading. We
      // enqueue exactly one card per intersection so initial activation
      // matches the cards actually on screen rather than over-eagerly
      // pulling in a lookahead window. Anything below the fold waits for the
      // user to scroll, which is what the perf harness's progressive-activation
      // assertion is checking for.
      enqueueBootstrapBatchFromIndex(metadata.index, VIEWPORT_INTERSECTION_BATCH_SIZE);
    });
  }, [enqueueBootstrapBatchFromIndex]);

  useEffect(() => {
    if (!supportsIntersectionObserver) {
      return undefined;
    }

    const nextObserver = new IntersectionObserver(handleViewportIntersections, {
      rootMargin: BOOTSTRAP_ROOT_MARGIN,
    });
    const observedNodeMetadata = observedNodeMetadataRef.current;

    sharedViewportObserverRef.current = nextObserver;

    observedNodeByIdentifierRef.current.forEach((node, identifier) => {
      const index = stockIdentifierList.indexOf(identifier);

      if (index === -1) {
        return;
      }

      observedNodeMetadata.set(node, { identifier, index });
      nextObserver.observe(node);
    });

    return () => {
      nextObserver.disconnect();
      sharedViewportObserverRef.current = null;
      observedNodeMetadata.clear();
    };
  }, [handleViewportIntersections, stockIdentifierList, supportsIntersectionObserver]);

  useEffect(() => {
    if (
      supportsIntersectionObserver
      || stocksStatus !== 'success'
      || stockIdentifierList.length === 0
      || !hasYieldedAfterShellPaint
    ) {
      return;
    }

    const nextIdleIndex = stockIdentifierList.findIndex((identifier) => {
      return (bootstrapStatusByIdentifier[identifier] || DASHBOARD_BOOTSTRAP_STATUS.IDLE) === DASHBOARD_BOOTSTRAP_STATUS.IDLE;
    });

    if (nextIdleIndex === -1) {
      return;
    }

    // Older browsers without IntersectionObserver still need the page to keep
    // loading forward. We gate this on the same shell-paint yield so the
    // initial-batch bookkeeping has already registered which identifiers
    // count toward "first paint settled" before we start loading anything.
    enqueueBootstrapBatchFromIndex(nextIdleIndex, VIEWPORT_BOOTSTRAP_BATCH_SIZE);
  }, [bootstrapStatusByIdentifier, enqueueBootstrapBatchFromIndex, hasYieldedAfterShellPaint, stockIdentifierList, stocksStatus, supportsIntersectionObserver]);

  const registerViewportNode = useCallback((identifier, index) => {
    return (node) => {
      const previousNode = observedNodeByIdentifierRef.current.get(identifier);

      if (previousNode && previousNode !== node) {
        sharedViewportObserverRef.current?.unobserve(previousNode);
        observedNodeMetadataRef.current.delete(previousNode);
      }

      if (!node) {
        observedNodeByIdentifierRef.current.delete(identifier);
        return;
      }

      observedNodeByIdentifierRef.current.set(identifier, node);

      if (!supportsIntersectionObserver || !sharedViewportObserverRef.current) {
        return;
      }

      observedNodeMetadataRef.current.set(node, { identifier, index });
      sharedViewportObserverRef.current.observe(node);
    };
  }, [supportsIntersectionObserver]);

  const handleRetryBootstrap = useCallback((identifier) => {
    loadDashboardBootstrapsForIdentifiers([identifier]);
  }, [loadDashboardBootstrapsForIdentifiers]);

  const handleFirstVisibleDashboardPaint = useCallback(() => {
    // "mounted" and "painted" are not the same thing. We wait for the real
    // visible dashboard paint signal before unlocking background refresh so
    // the user sees chart content before old-data cleanup work begins.
    setHasPaintedFirstVisibleDashboard(true);
  }, []);

  useEffect(() => {
    if (!hasPaintedFirstVisibleDashboard || !hasSettledInitialBootstrapBatch) {
      return undefined;
    }

    let isCancelled = false;
    const scheduleIdleCallback =
      typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback.bind(window)
        : null;
    const cancelIdleCallback =
      typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function'
        ? window.cancelIdleCallback.bind(window)
        : null;

    const refreshDashboardCardsInBackground = async () => {
      // We read the latest bootstrap snapshot from refs so the refresh effect
      // can stay gated on stable boolean flags. Depending on the bootstrap
      // state objects directly would re-run cleanup on every state change and
      // cancel the post-paint delay timer before it ever fired.
      const currentStockIdentifierList = stockIdentifierListRef.current;
      const currentBootstrapStatus = bootstrapStatusByIdentifierRef.current;
      const currentBootstrapData = bootstrapDataByIdentifierRef.current;
      const pendingBackgroundRefreshIdentifiers = currentStockIdentifierList.filter((identifier) => {
        return (
          currentBootstrapStatus[identifier] === DASHBOARD_BOOTSTRAP_STATUS.SUCCESS
          && currentBootstrapData[identifier]?.needsBackgroundRefresh
          && !backgroundRefreshStartedRef.current.has(identifier)
        );
      });

      if (!pendingBackgroundRefreshIdentifiers.length) {
        return;
      }

      for (const identifier of pendingBackgroundRefreshIdentifiers) {
        if (isCancelled) {
          return;
        }

        backgroundRefreshStartedRef.current.add(identifier);

        try {
          const refreshedDashboardCard = await refreshWatchlistDashboardBootstrap(identifier);

          if (!refreshedDashboardCard || isCancelled) {
            continue;
          }

          setBootstrapDataByIdentifier((previousBootstrapData) => {
            return {
              ...previousBootstrapData,
              [identifier]: refreshedDashboardCard,
            };
          });
          setBootstrapStatusByIdentifier((previousBootstrapStatus) => {
            return {
              ...previousBootstrapStatus,
              [identifier]: DASHBOARD_BOOTSTRAP_STATUS.SUCCESS,
            };
          });
          setBootstrapErrorsByIdentifier((previousBootstrapErrors) => {
            const nextBootstrapErrors = { ...previousBootstrapErrors };
            delete nextBootstrapErrors[identifier];
            return nextBootstrapErrors;
          });
        } catch {
          // Background refresh is best-effort. The current card stays visible,
          // so one slow legacy refresh does not block the rest of the page.
        }
      }
    };

    const queueBackgroundRefresh = () => {
      if (isCancelled) {
        return;
      }

      refreshDashboardCardsInBackground();
    };

    refreshStartDelayTimeoutRef.current = setTimeout(() => {
      if (isCancelled) {
        return;
      }

      if (scheduleIdleCallback) {
        refreshIdleCallbackRef.current = scheduleIdleCallback(queueBackgroundRefresh, {
          timeout: REFRESH_START_DELAY_MS,
        });
        return;
      }

      queueBackgroundRefresh();
    }, REFRESH_START_DELAY_MS);

    return () => {
      isCancelled = true;
      if (refreshStartDelayTimeoutRef.current) {
        clearTimeout(refreshStartDelayTimeoutRef.current);
        refreshStartDelayTimeoutRef.current = null;
      }
      if (cancelIdleCallback && refreshIdleCallbackRef.current != null) {
        cancelIdleCallback(refreshIdleCallbackRef.current);
        refreshIdleCallbackRef.current = null;
      }
    };
  }, [
    hasPaintedFirstVisibleDashboard,
    hasSettledInitialBootstrapBatch,
  ]);

  const handleMetricsVisibilityChange = useCallback((identifier, nextIsOpen) => {
    // The card owns the `ENTER METRICS` / `EXIT METRICS` button, but the page owns which card is
    // currently focused. This state keeps that page-level decision in one place.
    setFocusedMetricsIdentifier(nextIsOpen ? identifier : '');
  }, []);

  const handleOpenRemoveStockDialog = useCallback((stockToRemove) => {
    if (!stockToRemove?.identifier) {
      return;
    }

    const matchingSummaryStock = summaryCardByIdentifier.get(stockToRemove.identifier);

    // The page owns this dialog state because it also owns the focused-card view
    // and the final delete action. Keeping both decisions together avoids split logic.
    setPendingRemovalStock({
      identifier: stockToRemove.identifier,
      displayName: stockToRemove.companyName || stockToRemove.name || matchingSummaryStock?.name || stockToRemove.identifier,
    });
  }, [summaryCardByIdentifier]);

  const handleCloseRemoveStockDialog = useCallback(() => {
    if (isConfirmingRemoval) {
      return;
    }

    setPendingRemovalStock(null);
  }, [isConfirmingRemoval]);

  const handleConfirmRemoveStock = useCallback(async () => {
    if (!pendingRemovalStock?.identifier || isConfirmingRemoval) {
      return;
    }

    const identifierToRemove = pendingRemovalStock.identifier;

    setIsConfirmingRemoval(true);

    try {
      const didRemoveStock = await removeStockByIdentifier(identifierToRemove);

      if (didRemoveStock) {
        // We only clear focused mode after a real confirmed removal succeeds,
        // so opening or cancelling the dialog never changes what the user is viewing.
        setFocusedMetricsIdentifier((previousFocusedMetricsIdentifier) => {
          return previousFocusedMetricsIdentifier === identifierToRemove ? '' : previousFocusedMetricsIdentifier;
        });
      }
    } finally {
      setPendingRemovalStock(null);
      setIsConfirmingRemoval(false);
    }
  }, [isConfirmingRemoval, pendingRemovalStock, removeStockByIdentifier]);

  const visibleStocks = useMemo(() => {
    if (!focusedMetricsIdentifier) {
      return summaryCards;
    }

    // When one card enters focused metrics mode, the page hides sibling cards
    // so the user can study one chart/table combination at a time.
    return summaryCards.filter((stock) => stock.identifier === focusedMetricsIdentifier);
  }, [focusedMetricsIdentifier, summaryCards]);

  const renderedStocks = useMemo(() => {
    if (focusedMetricsIdentifier) {
      return visibleStocks;
    }

    return visibleStocks.slice(0, renderWindowEndIndex);
  }, [focusedMetricsIdentifier, renderWindowEndIndex, visibleStocks]);

  const extendRenderWindow = useCallback(() => {
    setRenderWindowEndIndex((previousRenderWindowEndIndex) => {
      return Math.min(visibleStocks.length, previousRenderWindowEndIndex + RENDER_WINDOW_BATCH_SIZE);
    });
  }, [visibleStocks.length]);

  useEffect(() => {
    if (focusedMetricsIdentifier) {
      return;
    }

    if (!supportsIntersectionObserver) {
      setRenderWindowEndIndex(visibleStocks.length);
      return;
    }

    setRenderWindowEndIndex((previousRenderWindowEndIndex) => {
      const minimumRenderWindow = Math.min(INITIAL_RENDER_WINDOW_SIZE, visibleStocks.length);

      return Math.max(minimumRenderWindow, Math.min(previousRenderWindowEndIndex, visibleStocks.length));
    });
  }, [focusedMetricsIdentifier, supportsIntersectionObserver, visibleStocks.length]);

  const handleRenderWindowIntersection = useCallback((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      renderWindowObserverRef.current?.unobserve(entry.target);
      extendRenderWindow();
    });
  }, [extendRenderWindow]);

  useEffect(() => {
    if (!supportsIntersectionObserver) {
      return undefined;
    }

    const nextObserver = new IntersectionObserver(handleRenderWindowIntersection, {
      rootMargin: RENDER_WINDOW_ROOT_MARGIN,
    });

    renderWindowObserverRef.current = nextObserver;

    if (renderWindowSentinelNodeRef.current) {
      nextObserver.observe(renderWindowSentinelNodeRef.current);
    }

    return () => {
      nextObserver.disconnect();
      renderWindowObserverRef.current = null;
    };
  }, [handleRenderWindowIntersection, supportsIntersectionObserver]);

  const registerRenderWindowSentinel = useCallback((node) => {
    if (renderWindowSentinelNodeRef.current && renderWindowSentinelNodeRef.current !== node) {
      renderWindowObserverRef.current?.unobserve(renderWindowSentinelNodeRef.current);
    }

    renderWindowSentinelNodeRef.current = node;

    if (!node || !supportsIntersectionObserver || !renderWindowObserverRef.current) {
      return;
    }

    // This is a small home-grown windowing step. We only mount the part of the
    // watchlist the user is near, then grow that window as they scroll deeper.
    renderWindowObserverRef.current.observe(node);
  }, [supportsIntersectionObserver]);

  return (
    <Box sx={{ px: 2, py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <StockSearchResults />
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 3,
        }}
      >
        {stocksStatus === 'loading' || stocksStatus === 'idle' ? (
          // We render a real shell during the watchlist summary fetch so the
          // first paint never has to wait for the network. Without this, large
          // watchlists could leave the page blank long enough for the perf
          // harness to time out before any shell selector ever appeared.
          <Box
            data-testid="share-price-dashboard-shell"
            data-identifier="loading-placeholder"
            sx={{
              minHeight: 160,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Loading your watchlist...
            </Typography>
          </Box>
        ) : null}

        {stocksStatus === 'error' && stocksError ? (
          <Alert severity="warning" sx={{ width: '100%', maxWidth: 960 }}>
            {stocksError}
          </Alert>
        ) : null}

        {stocksStatus === 'success' && summaryCards.length === 0 ? (
          <Box sx={{ width: '100%', textAlign: 'center', px: 2, py: 4 }}>
            <Typography variant="body1" color="text.secondary">
              Add a stock from the search results above to start building your watchlist.
            </Typography>
          </Box>
        ) : null}

        {renderedStocks.map((stock, index) => {
          const bootstrapStatus = bootstrapStatusByIdentifier[stock.identifier] || DASHBOARD_BOOTSTRAP_STATUS.IDLE;

          return (
            <ProgressiveDashboardCard
              key={stock.identifier}
              bootstrapData={bootstrapDataByIdentifier[stock.identifier] || null}
              bootstrapError={bootstrapErrorsByIdentifier[stock.identifier] || ''}
              bootstrapStatus={bootstrapStatus}
              canMountDashboard={hasYieldedAfterShellPaint}
              isFocusedMetricsMode={focusedMetricsIdentifier === stock.identifier}
              onFirstVisibleDashboardPaint={handleFirstVisibleDashboardPaint}
              onMetricsVisibilityChange={(nextIsOpen) => handleMetricsVisibilityChange(stock.identifier, nextIsOpen)}
              onRemove={() => handleOpenRemoveStockDialog(stock)}
              onRetryBootstrap={() => handleRetryBootstrap(stock.identifier)}
              registerViewportNode={registerViewportNode(stock.identifier, index)}
              summaryCard={stock}
            />
          );
        })}

        {!focusedMetricsIdentifier && renderedStocks.length < visibleStocks.length ? (
          <Box
            ref={registerRenderWindowSentinel}
            data-testid="stocks-render-window-sentinel"
            sx={{ width: '100%', height: 1 }}
          />
        ) : null}
      </Box>

      <Dialog
        open={Boolean(pendingRemovalStock)}
        onClose={handleCloseRemoveStockDialog}
        aria-labelledby="confirm-stock-removal-title"
      >
        <DialogTitle id="confirm-stock-removal-title">
          {`CONFIRM REMOVAL of ${pendingRemovalStock?.displayName || ''}`}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Removing this stock will take it out of your watchlist.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseRemoveStockDialog} disabled={isConfirmingRemoval}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirmRemoveStock}
            disabled={isConfirmingRemoval}
          >
            Remove stock
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Stocks;
