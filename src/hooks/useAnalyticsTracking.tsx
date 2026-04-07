import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function useAnalyticsTracking() {
  const location = useLocation();
  const { user, role } = useAuth();
  const lastPath = useRef<string>("");

  // Track page views
  useEffect(() => {
    if (!user || location.pathname === lastPath.current) return;
    lastPath.current = location.pathname;

    supabase.from("page_views").insert({
      user_id: user.id,
      page_path: location.pathname,
      user_role: role || "unknown",
    }).then(() => {});
  }, [location.pathname, user, role]);

  // Track click events
  useEffect(() => {
    if (!user) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      // Only track interactive elements and their parents
      const interactive = target.closest("a, button, [role='button'], [role='tab'], [role='menuitem'], input, select, textarea");
      if (!interactive) return;

      const el = interactive as HTMLElement;
      supabase.from("click_events").insert({
        user_id: user.id,
        page_path: location.pathname,
        element_tag: el.tagName.toLowerCase(),
        element_text: (el.textContent || "").slice(0, 100).trim() || null,
        element_id: el.id || null,
        element_class: (el.className && typeof el.className === "string") ? el.className.slice(0, 200) : null,
        user_role: role || "unknown",
      }).then(() => {});
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [user, role, location.pathname]);
}
