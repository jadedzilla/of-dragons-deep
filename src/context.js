import { createContext, useContext } from "react";

/**
 * App-wide state (provided by App.jsx): { fish, spear, allFish, fishById, caught, isCaught, setCaught, marks, setMarks,
 * progress, setProgress, openFish(f), openBait(id), openImport() }.
 */
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
