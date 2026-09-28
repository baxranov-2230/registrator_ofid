import { createContext, useContext } from "react";

export type ColorMode = "light" | "dark";
export const AppearanceContext = createContext<{ mode: ColorMode; toggleMode: () => void }>({
  mode: "light",
  toggleMode: () => {},
});
export const useAppearance = () => useContext(AppearanceContext);
