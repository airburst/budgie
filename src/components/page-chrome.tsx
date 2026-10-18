import { useIsMobile } from "@/hooks/useIsMobile";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Phone header chrome owned by the page: the title, an optional back arrow
 * (replacing the hamburger on drill-down pages) and one primary action slot on
 * the right. From `md` the header is the top nav and pages draw their own
 * heading and buttons, so none of this is used there.
 */
type Chrome = { title?: string; onBack?: () => void };

type PageChromeContextValue = {
  chrome: Chrome;
  setChrome: (chrome: Chrome) => void;
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
};

const PageChromeContext = createContext<PageChromeContextValue | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<Chrome>({});
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ chrome, setChrome, slot, setSlot }),
    [chrome, slot],
  );
  return (
    <PageChromeContext.Provider value={value}>
      {children}
    </PageChromeContext.Provider>
  );
}

/** Null outside a provider (e.g. a page rendered without Layout in tests). */
export function usePageChrome() {
  return useContext(PageChromeContext);
}

/**
 * Sets the phone header title and/or back handler while mounted. Render it
 * inside `<Layout>`: the page component itself sits outside the provider, so a
 * hook called from the page body would find no context.
 */
export function PageHeader(props: Chrome) {
  usePageHeader(props);
  return null;
}

function usePageHeader({ title, onBack }: Chrome) {
  const setChrome = useContext(PageChromeContext)?.setChrome;
  const backRef = useRef(onBack);
  const hasBack = Boolean(onBack);

  useEffect(() => {
    backRef.current = onBack;
  });

  useEffect(() => {
    if (!setChrome) return;
    setChrome({
      title,
      onBack: hasBack ? () => backRef.current?.() : undefined,
    });
    return () => setChrome({});
  }, [setChrome, title, hasBack]);
}

/**
 * The page's primary action. On phones it renders in the header's right-hand
 * slot; otherwise (and without a header) it renders in place, once, so there
 * is never a hidden duplicate.
 */
export function HeaderAction({ children }: { children: ReactNode }) {
  const ctx = usePageChrome();
  const isMobile = useIsMobile();
  if (!ctx || !isMobile) return <>{children}</>;
  return ctx.slot ? createPortal(children, ctx.slot) : null;
}
