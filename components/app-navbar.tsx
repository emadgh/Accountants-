'use client';

import { Children, createContext, isValidElement, useContext, useLayoutEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { AlignJustify, LogOut, Menu, Rows2, Rows3, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TableDensity } from '@/components/ui/data-table';

type NavbarContent = {
  actionKey: string;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
};

const NavbarContext = createContext<Dispatch<SetStateAction<NavbarContent | null>> | null>(null);

type ActionSignatureProps = {
  children?: ReactNode;
  [key: string]: unknown;
};

function getActionSignature(content: ReactNode): string {
  return Children.toArray(content).map((node) => {
    if (!isValidElement<ActionSignatureProps>(node)) {
      return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
    }

    const typeName = typeof node.type === 'string'
      ? node.type
      : typeof node.type === 'function'
        ? node.type.name
        : String(node.type);
    const scalarProps = Object.entries(node.props)
      .filter(([key, value]) => key !== 'children' && ['string', 'number', 'boolean'].includes(typeof value))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(',');

    return [
      typeName,
      node.key ?? '',
      scalarProps,
      getActionSignature(node.props.children),
    ].join(':');
  }).join('|');
}

export function AppNavbar({
  children,
  onSearch,
  onLogout,
  onMenuToggle,
  tableDensity,
  onTableDensityToggle,
}: {
  children: ReactNode;
  onSearch: () => void;
  onLogout?: () => void;
  onMenuToggle?: () => void;
  tableDensity: TableDensity;
  onTableDensityToggle: () => void;
}) {
  const [navbarContent, setNavbarContent] = useState<NavbarContent | null>(null);

  return (
    <>
      <header dir="rtl" className="screen-only sticky top-0 z-20 border-b border-slate-200 bg-white/95 py-2 backdrop-blur">
        <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {onMenuToggle && (
                <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={onMenuToggle} aria-label="منو">
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              <div className="hidden shrink-0 border-l border-slate-200 pl-3 text-xs font-black text-slate-400 sm:block">حسابداری</div>
              <div className="min-w-0 flex-1">
                {navbarContent && (
                  <div className="flex min-w-0 items-center gap-2">
                    {navbarContent.leading && <div className="flex shrink-0 items-center gap-2">{navbarContent.leading}</div>}
                    <div className="min-w-0">
                      <h1 className="truncate text-lg font-black text-slate-950 sm:text-xl">{navbarContent.title}</h1>
                      {navbarContent.subtitle && <div className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">{navbarContent.subtitle}</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="order-3 flex min-w-0 w-full flex-wrap items-center gap-2 empty:hidden sm:order-none sm:w-auto sm:flex-1 sm:justify-end">
              <AnimatePresence initial={false} mode="wait">
                {navbarContent?.actions && (
                  <motion.div
                    key={navbarContent.actionKey}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4, pointerEvents: 'none', transition: { duration: 0.14 } }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    {navbarContent.actions}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" onClick={onSearch} aria-label="جست‌وجوی سراسری" title="جست‌وجوی سراسری · Ctrl/Cmd + K">
                <Search className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onTableDensityToggle}
                aria-label={tableDensity === 'normal' ? 'تغییر به نمای فشرده جدول' : tableDensity === 'condensed' ? 'تغییر به نمای فشرده‌تر جدول' : 'تغییر به نمای عادی جدول'}
                title={tableDensity === 'normal' ? 'نمای فعلی: عادی' : tableDensity === 'condensed' ? 'نمای فعلی: فشرده' : 'نمای فعلی: فشرده‌تر'}
              >
                {tableDensity === 'normal' ? <Rows2 className="h-5 w-5" /> : tableDensity === 'condensed' ? <Rows3 className="h-5 w-5" /> : <AlignJustify className="h-5 w-5" />}
              </Button>
              {onLogout && (
                <Button variant="ghost" size="icon" onClick={onLogout} aria-label="خروج" title="خروج">
                  <LogOut className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <NavbarContext.Provider value={setNavbarContent}>
        {children}
      </NavbarContext.Provider>
    </>
  );
}

export function AppNavbarContent({
  title,
  subtitle,
  leading,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  const setNavbarContent = useContext(NavbarContext);
  const pathname = usePathname();
  const actionKey = `${pathname}:${getActionSignature(actions)}`;

  useLayoutEffect(() => {
    if (!setNavbarContent) return;
    setNavbarContent({ actionKey, title, subtitle, leading, actions });
  }, [setNavbarContent, actionKey, title, subtitle, leading, actions]);

  return null;
}
