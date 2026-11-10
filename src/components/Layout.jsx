import React, { useEffect, useState } from "react";
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  IconButton, useMediaQuery,
} from "@mui/material";
import {
  DashboardRounded, ShowChartRounded, WorkOutlineRounded, HistoryRounded,
  ReceiptLongRounded, StarBorderRounded, InsightsRounded, PieChartRounded,
  AssessmentRounded, NotificationsNoneRounded, PsychologyRounded,
  CalendarMonthRounded, AutoGraphRounded, PersonOutlineRounded,
  SettingsRounded, LogoutRounded, MenuRounded, TrendingUpRounded,
  RocketLaunchRounded, TrendingDownRounded, BoltRounded,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import ramLogo from "../assets/ram-logo.png";
import ramMountain from "../assets/ram-mountain-promo.png";

const drawerWidth = 270;

const menu = [
  ["Dashboard", <DashboardRounded />, "/"],
  ["Market Overview", <ShowChartRounded />, "/module/market"],
  ["Open Positions", <WorkOutlineRounded />, "/trades"],
  ["Trade History", <HistoryRounded />, "/trades"],
  ["Orders", <ReceiptLongRounded />, "/module/orders"],
  ["Watchlist", <StarBorderRounded />, "/module/watchlist"],
  ["Performance", <TrendingUpRounded />, "/module/performance"],
  ["Analytics", <PieChartRounded />, "/module/analytics"],
  ["Reports", <AssessmentRounded />, "/module/reports"],
  ["Alerts", <NotificationsNoneRounded />, "/module/alerts"],
];

const strategies = [
  ["Intraday Engine", <BoltRounded />, "/intraday", "PAPER"],
  ["Monthly Momentum", <RocketLaunchRounded />, "/momentum", "NEW"],
  ["FADE Paper Book", <TrendingDownRounded />, "/fade", "PAPER"],
];

const tools = [
  ["AI Insights", <PsychologyRounded />, "/module/ai"],
  ["Economic Calendar", <CalendarMonthRounded />, "/module/calendar"],
  ["Strategy Builder", <AutoGraphRounded />, "/module/strategy"],
];

const account = [
  ["Profile", <PersonOutlineRounded />, "/module/profile"],
  ["Settings", <SettingsRounded />, "/module/settings"],
];

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const mobile = useMediaQuery("(max-width:900px)", { noSsr: true });
  const [open, setOpen] = useState(!mobile);

  // Drawer starts closed on phones and open on desktop, also after a resize.
  useEffect(() => setOpen(!mobile), [mobile]);

  const go = (path) => {
    navigate(path);
    if (mobile) setOpen(false);
  };

  const renderItems = (items) => items.map(([name, icon, path, badge]) => {
    const active = location.pathname === path || (
      (name === "Open Positions" || name === "Trade History") && location.pathname === "/trades"
    );

    return (
      <ListItemButton
        key={name}
        className={active ? "activeNav" : ""}
        onClick={() => go(path)}
      >
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText primary={name} />
        {badge && <span className="navBadge">{badge}</span>}
      </ListItemButton>
    );
  });

  const sidebar = (
    <Box className="sidebar">
      <Box className="brandBlock" onClick={() => go("/")}>
        <img className="ramLogo" src={ramLogo} alt="RAM Risk & AI Monitor" />
      </Box>

      <Box className="navScroll">
        <Box className="navLabel">MAIN MENU</Box>
        <List>{renderItems(menu)}</List>
        <Box className="navLabel">STRATEGIES</Box>
        <List>{renderItems(strategies)}</List>
        <Box className="navLabel">TOOLS</Box>
        <List>{renderItems(tools)}</List>
        <Box className="navLabel">ACCOUNT</Box>
        <List>{renderItems(account)}</List>
        <ListItemButton className="logoutNav" onClick={() => go("/")}>
          <ListItemIcon><LogoutRounded /></ListItemIcon>
          <ListItemText primary="Logout" />
        </ListItemButton>

        <Box className="ramPromo">
          <img src={ramMountain} alt="RAM discipline visual" />
          <Box className="promoOverlay">
            <span className="promoLabel">DISCIPLINE TODAY</span>
            <strong>WEALTH TOMORROW</strong>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box>
      {mobile && (
        <IconButton className="mobileMenuButton" onClick={() => setOpen(true)} aria-label="Open navigation">
          <MenuRounded />
        </IconButton>
      )}

      <Drawer
        variant={mobile ? "temporary" : "persistent"}
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            border: 0,
            background: "#081421",
          },
        }}
      >
        {sidebar}
      </Drawer>

      <Box className="content" sx={{ ml: open && !mobile ? `${drawerWidth}px` : 0 }}>
        {children}
      </Box>
    </Box>
  );
}
