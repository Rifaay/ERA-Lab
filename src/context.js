import { createContext, useContext } from "react";

export const AppContext = createContext({
  selectedId: "",
  setSelectedId: () => {},
  lang: "en",
  setLang: () => {},
});

export const useApp = () => useContext(AppContext);
