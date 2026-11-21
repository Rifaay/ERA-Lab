import { createContext, useContext } from "react";

export const AppContext = createContext({
  selectedId: "",
  setSelectedId: () => {},
  lang: "en",
  setLang: () => {},
  archer: false, // true in the archer's own app
});

export const useApp = () => useContext(AppContext);
