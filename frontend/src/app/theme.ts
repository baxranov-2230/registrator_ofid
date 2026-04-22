import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1a4b8c" },
    secondary: { main: "#e8a317" },
    background: { default: "#f5f6fa" },
  },
  typography: {
    fontFamily:
      'Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
});
