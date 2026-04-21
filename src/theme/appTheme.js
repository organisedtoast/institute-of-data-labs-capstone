import { alpha, createTheme } from '@mui/material/styles';

// This theme keeps the app on a quiet light palette so the stock data stays
// visually primary. We only define a small set of shared surface rules here.
const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#4a148c',
      dark: '#3f1178',
      light: '#f4effa',
    },
    background: {
      default: '#f7f8fa',
      paper: '#ffffff',
    },
    text: {
      primary: '#151d1c',
      secondary: '#5f6b7a',
    },
    divider: '#dde3ec',
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
    h5: {
      fontWeight: 500,
      letterSpacing: '-0.01em',
      lineHeight: 1.18,
    },
    subtitle2: {
      fontWeight: 600,
      letterSpacing: '0.01em',
    },
    body2: {
      lineHeight: 1.5,
    },
    button: {
      fontWeight: 500,
      letterSpacing: '0.02em',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#f7f8fa',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #dde3ec',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
          backgroundColor: '#ffffff',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: 'none',
        },
        outlined: {
          borderColor: alpha('#4a148c', 0.35),
          color: '#4a148c',
        },
        text: {
          color: '#4a148c',
        },
        contained: {
          backgroundColor: '#4a148c',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#d7deea',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#b8c4d6',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#4a148c',
          },
        },
      },
    },
  },
});

export default appTheme;
