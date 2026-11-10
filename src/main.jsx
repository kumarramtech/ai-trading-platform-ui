import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import App from "./App.jsx";
import "./styles.css";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#4f7cff" },
    success: { main: "#19d39b" },
    error: { main: "#ff5570" },
    warning: { main: "#f6a623" },
    background: { default: "#06111f", paper: "#0b1929" },
    text: { primary: "#eef5ff", secondary: "#8fa4c2" },
  },
  shape: { borderRadius: 18 },
  typography: { fontFamily: "Inter, Segoe UI, Arial, sans-serif" },
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
