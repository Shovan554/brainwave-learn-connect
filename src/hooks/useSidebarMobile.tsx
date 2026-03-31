import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";

interface SidebarContextType {
  isOpen: boolean;
  collapsed: boolean;
  toggle: () => void;
  close: () => void;
  toggleCollapse: () => void;
}

const SidebarMobileContext = createContext<SidebarContextType>({
  isOpen: false,
  collapsed: false,
  toggle: () => {},
  close: () => {},
  toggleCollapse: () => {},
});

export function SidebarMobileProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });
  const location = useLocation();

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggleCollapse = useCallback(() => {
    setCollapsed((v) => {
      localStorage.setItem("sidebar-collapsed", String(!v));
      return !v;
    });
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  return (
    <SidebarMobileContext.Provider value={{ isOpen, collapsed, toggle, close, toggleCollapse }}>
      {children}
    </SidebarMobileContext.Provider>
  );
}

export function useSidebarMobile() {
  return useContext(SidebarMobileContext);
}
