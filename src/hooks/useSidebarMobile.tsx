import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";

interface SidebarMobileContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarMobileContext = createContext<SidebarMobileContextType>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
});

export function SidebarMobileProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Close sidebar on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  return (
    <SidebarMobileContext.Provider value={{ isOpen, toggle, close }}>
      {children}
    </SidebarMobileContext.Provider>
  );
}

export function useSidebarMobile() {
  return useContext(SidebarMobileContext);
}
