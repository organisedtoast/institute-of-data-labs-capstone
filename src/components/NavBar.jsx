import * as React from 'react';
import { styled, alpha } from '@mui/material/styles';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import { NavLink } from 'react-router-dom';

import useStockSearch from '../hooks/useStockSearch';

const navlinkStyle = {
  color: '#151d1c',
  textDecoration: 'none',
};

const Search = styled('form')(({ theme }) => ({
  position: 'relative',
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  '&:hover': {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  marginRight: theme.spacing(2),
  marginLeft: 0,
  width: '100%',
  minWidth: 0,
  flex: 1,
  [theme.breakpoints.up('sm')]: {
    marginLeft: theme.spacing(3),
    width: 'auto',
    flex: '0 1 auto',
  },
}));

const SearchIconWrapper = styled('div')(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: '100%',
  position: 'absolute',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: 'inherit',
  '& .MuiInputBase-input': {
    padding: theme.spacing(1, 1, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    width: '100%',
    [theme.breakpoints.up('md')]: {
      width: '20ch',
    },
  },
}));

export default function NavBar() {
  const {
    searchText,
    setSearchText,
    runStockSearch,
  } = useStockSearch();

  // State to track which element the menu is anchored to (null = menu is closed)
  const [anchorEl, setAnchorEl] = React.useState(null);

  // Convert anchorEl to boolean: true if menu should be open, false if closed
  const isMenuOpen = Boolean(anchorEl);

  // Opens the menu when the MenuIcon button is clicked
  // event.currentTarget is the button that was clicked - the menu will appear anchored to this element
  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  // Closes the menu by setting anchorEl back to null
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // The navbar search is now a real form submit instead of a decorative input.
  // Using a form means pressing Enter works automatically, which is a familiar browser behaviour.
  const handleSearchSubmit = async (event) => {
    event.preventDefault();

    // The search itself should stay on the current page.
    // Home can now show search results too, so we only navigate later if the user chooses to add a stock card.
    await runStockSearch();
  };

  const menuId = 'nav-menu';

  // This variable holds the JSX for the dropdown menu containing navigation links
  // The menu appears when anchorEl is set (i.e., when handleMenuOpen is called)
  const renderMenu = (
    <Menu
      // anchorEl tells the Menu where to position itself (the button it should appear next to)
      anchorEl={anchorEl}
      // Position the menu below and to the right of the anchor element
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      id={menuId}
      // keepMounted keeps the menu in the DOM even when closed (better for accessibility)
      keepMounted
      // Transform origin determines which corner of the menu aligns with the anchor
      transformOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      // Menu is open when isMenuOpen is true (when anchorEl is not null)
      open={isMenuOpen}
      // Close the menu when user clicks outside or presses Escape
      onClose={handleMenuClose}
    >
      {/* Each MenuItem is a row in the dropdown menu */}
      {/* When clicked, close the menu and navigate to the specified route */}
      <MenuItem onClick={handleMenuClose}>
        <NavLink style={navlinkStyle} to="/">Home</NavLink>
      </MenuItem>
      <MenuItem onClick={handleMenuClose}>
        <NavLink style={navlinkStyle} to="/stocks">Stocks</NavLink>
      </MenuItem>
    </Menu>
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ backgroundColor: '#4a148c' }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            size="large"
            edge="start"
            color="inherit"
            aria-label="open drawer"
            sx={{ mr: { xs: 0, sm: 2 } }}
            onClick={handleMenuOpen}
          >
            <MenuIcon />
          </IconButton>

          {/* On very small screens, the search box is more important than the full title.
              Hiding the long title on `xs` stops the text and search field from colliding.
              We keep the full branding visible again from `sm` upward where there is enough room. */}
          <NavLink
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              color: '#ffffff',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <Typography
              variant="h6"
              noWrap
              component="div"
              sx={{
                color: '#ffffff',
                display: { xs: 'none', sm: 'block' },
                flexShrink: 0,
              }}
            >
              Stock Gossip Monitor
            </Typography>
          </NavLink>

          {/* In a flex row, `minWidth: 0` is the key that allows the search area to shrink
              instead of overflowing past its neighbours. Without it, long content can push
              outside the toolbar even when `flex: 1` is present. */}
          <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <Search onSubmit={handleSearchSubmit}>
            <SearchIconWrapper>
              <SearchIcon />
            </SearchIconWrapper>
            <StyledInputBase
              placeholder="Search stocks..."
              inputProps={{ 'aria-label': 'search' }}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </Search>
          </Box>
        </Toolbar>
      </AppBar>
      {renderMenu}
    </Box>
  );
}
