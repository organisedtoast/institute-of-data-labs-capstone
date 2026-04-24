export const ENHANCED_INTERNAL_SCROLLBAR_SIZE = '24px';
export const ENHANCED_INTERNAL_SCROLLBAR_THUMB_BORDER = '2px solid rgba(148, 163, 184, 0.18)';
export const ENHANCED_INTERNAL_SCROLLBAR_COLORS = '#94a3b8 rgba(148, 163, 184, 0.18)';

// These styles are opt-in on purpose. We only want thicker internal card
// scrollbars on the Home and Stocks page surfaces, not every scrollbar in the app.
// The first attempt used 16px, but that was still subtle enough to look unchanged.
// Locking a larger shared size here makes the thicker scrollbar behavior obvious.
export const enhancedInternalScrollbarSx = {
  // Chromium browsers now support the standard scrollbar properties too.
  // If we set `scrollbar-color` globally, Edge treats that as the active rule
  // and stops honoring the wider `::-webkit-scrollbar` width. We split the
  // helper by feature support so Chromium keeps the pixel width, while Firefox
  // falls back to the standards-based colors and widest keyword size it supports.
  '@supports selector(::-webkit-scrollbar)': {
    '&::-webkit-scrollbar': {
      width: ENHANCED_INTERNAL_SCROLLBAR_SIZE,
      height: ENHANCED_INTERNAL_SCROLLBAR_SIZE,
    },
    '&::-webkit-scrollbar-track': {
      backgroundColor: 'rgba(148, 163, 184, 0.18)',
      borderRadius: '999px',
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#94a3b8',
      borderRadius: '999px',
      // A smaller inset border keeps the thumb readable without shrinking the
      // apparent width back toward the old, too-thin look.
      border: ENHANCED_INTERNAL_SCROLLBAR_THUMB_BORDER,
    },
    '&::-webkit-scrollbar-thumb:hover': {
      backgroundColor: '#64748b',
    },
  },
  '@supports not selector(::-webkit-scrollbar)': {
    scrollbarWidth: 'auto',
    scrollbarColor: ENHANCED_INTERNAL_SCROLLBAR_COLORS,
  },
};
