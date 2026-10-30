"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "lucide-react";
import { Slot } from "radix-ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";

import { MOBILE_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import {
  SIDEBAR_COLLAPSE_QUERY,
  setSidebarState,
  sidebarState,
  storedSidebarState,
  subscribeSidebar,
  type SidebarState,
} from "@/lib/preferences";

import { Button } from "./button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const SIDEBAR_WIDTH = "15rem";
const SIDEBAR_WIDTH_MOBILE = "16rem";
const SIDEBAR_WIDTH_ICON = "3rem";

type SidebarContextValue = {
  state: SidebarState;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return context;
}

const isMobileNow = () => window.matchMedia(MOBILE_QUERY).matches;
const isNarrowNow = () => window.matchMedia(SIDEBAR_COLLAPSE_QUERY).matches;

export function SidebarProvider({ className, style, children, ...props }: ComponentProps<"div">) {
  const [openMobile, setOpenMobile] = useState(false);
  const state = useSyncExternalStore(subscribeSidebar, sidebarState, () => "expanded" as const);

  const toggleSidebar = useCallback(() => {
    if (isMobileNow()) {
      setOpenMobile((open) => !open);
      return;
    }
    // Only a choice made on a wide screen is remembered; tablets always start collapsed.
    setSidebarState(sidebarState() === "collapsed" ? "expanded" : "collapsed", !isNarrowNow());
  }, []);

  useEffect(() => {
    const narrow = window.matchMedia(SIDEBAR_COLLAPSE_QUERY);
    const mobile = window.matchMedia(MOBILE_QUERY);
    const onResize = () => {
      setSidebarState(narrow.matches ? "collapsed" : storedSidebarState(), false);
    };
    const onMobileChange = () => {
      if (!mobile.matches) setOpenMobile(false);
    };
    // ⌘B on macOS, Ctrl+B elsewhere (Ctrl+B is "back one character" in macOS text fields).
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.key?.toLowerCase() !== "b") return;
      if (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    narrow.addEventListener("change", onResize);
    mobile.addEventListener("change", onMobileChange);
    window.addEventListener("keydown", onKey);
    return () => {
      narrow.removeEventListener("change", onResize);
      mobile.removeEventListener("change", onMobileChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [toggleSidebar]);

  const value = useMemo(
    () => ({ state, openMobile, setOpenMobile, toggleSidebar }),
    [state, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as CSSProperties
        }
        className={cn("flex min-h-svh w-full bg-sidebar", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  className,
  children,
  label,
}: {
  className?: string;
  children: ReactNode;
  label: string;
}) {
  const { openMobile, setOpenMobile } = useSidebar();
  return (
    <>
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          showClose={false}
          className="w-(--sidebar-width-mobile) bg-sidebar p-0 text-sidebar-foreground sm:max-w-none md:hidden"
        >
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <nav aria-label={label} className="flex h-full w-full flex-col">
            {children}
          </nav>
        </SheetContent>
      </Sheet>
      <div data-slot="sidebar-desktop" className="hidden text-sidebar-foreground md:block">
        <div
          data-slot="sidebar-gap"
          className="relative h-svh w-(--sidebar-width) transition-[width] duration-150 ease-out collapsed:w-(--sidebar-width-icon)"
        />
        <nav
          aria-label={label}
          data-slot="sidebar-container"
          className={cn(
            "fixed inset-y-0 left-0 z-10 flex h-svh w-(--sidebar-width) flex-col overflow-hidden transition-[width] duration-150 ease-out collapsed:w-(--sidebar-width-icon)",
            className,
          )}
        >
          {children}
        </nav>
      </div>
    </>
  );
}

export function SidebarTrigger({ className, ...props }: ComponentProps<typeof Button>) {
  const { toggleSidebar, state } = useSidebar();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-slot="sidebar-trigger"
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle sidebar"
          aria-keyshortcuts="Meta+B Control+B"
          data-state={state}
          className={cn("-ml-1", className)}
          onClick={toggleSidebar}
          {...props}
        >
          <PanelLeft className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Toggle sidebar <kbd className="ml-1 font-sans text-muted-foreground">⌘B</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarInset({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      id="main"
      tabIndex={-1}
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full min-w-0 flex-1 flex-col bg-background outline-none md:my-2 md:mr-2 md:h-[calc(100svh-1rem)] md:overflow-clip md:rounded-lg md:border",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col overflow-auto collapsed:overflow-hidden", className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("flex flex-col gap-1 p-2", className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("flex w-full min-w-0 flex-col px-2 py-1.5", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "flex h-7 shrink-0 items-center px-2 text-xs font-medium text-muted-foreground transition-[margin,opacity] duration-150 ease-out collapsed:-mt-7 collapsed:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex w-full min-w-0 flex-col gap-px", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("relative", className)} {...props} />;
}

const sidebarMenuButtonVariants = cva(
  "flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md px-2 text-left text-[13px] text-sidebar-foreground/85 transition-colors duration-100 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground collapsed:size-8! collapsed:justify-center collapsed:p-0! collapsed:[&>span:not([data-icon])]:sr-only [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-sidebar-accent-foreground",
  {
    variants: {
      size: { default: "h-7", lg: "h-10" },
    },
    defaultVariants: { size: "default" },
  },
);

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  tooltip,
  size,
  className,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  const { state } = useSidebar();
  const mobile = useMediaQuery(MOBILE_QUERY);
  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ size }), className)}
      {...props}
    />
  );
  // Labels are visible unless the desktop rail shows icons only.
  if (!tooltip || state !== "collapsed" || mobile) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
