import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";

import { store } from "@/app/store";
import { router } from "@/app/router";
import { createAppTheme } from "@/app/theme";
import { AppearanceContext, type ColorMode } from "@/app/appearance";
import AuthProvider from "@/app/AuthProvider";
import "@/app/i18n";

function App() {
  const [mode, setMode] = React.useState<ColorMode>(() => {
    try { return localStorage.getItem("royd_color_mode") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const theme = React.useMemo(() => createAppTheme(mode), [mode]);
  const toggleMode = React.useCallback(() => setMode((current) => current === "light" ? "dark" : "light"), []);
  React.useEffect(() => {
    try { localStorage.setItem("royd_color_mode", mode); } catch { /* Storage can be disabled. */ }
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  return (
    <AppearanceContext.Provider value={{ mode, toggleMode }}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
    </AppearanceContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
