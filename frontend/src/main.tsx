import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";

import { store } from "@/app/store";
import { router } from "@/app/router";
import { theme } from "@/app/theme";
import AuthProvider from "@/app/AuthProvider";
import "@/app/i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
);
