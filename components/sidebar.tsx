'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  FileText,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { sidebarGroups, type ViewKey } from '@/components/sidebar-config';

export type { ViewKey } from '@/components/sidebar-config';

const defaultExpanded = Object.fromEntries(
  sidebarGroups.filter((group) => group.collapsible).map((group) => [group.id, true])
) as Record<string, boolean>;

const SESSION_KEY = 'accountants:sidebar-groups';

export function Sidebar({
  active,
  onChange,
  open,
  onOpenChange,
}: {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(defaultExpanded);

  const activeGroupId = useMemo(
    () => sidebarGroups.find((group) => group.items.some((item) => item.key === active))?.id,
    [active]
  );

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SESSION_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      setExpanded((current) => ({ ...current, ...parsed }));
    } catch {
      // Invalid session data should never prevent navigation.
    }
  }, []);

  useEffect(() => {
    if (!activeGroupId) return;
    const activeGroup = sidebarGroups.find((group) => group.id === activeGroupId);
    if (!activeGroup?.collapsible) return;
    setExpanded((current) => current[activeGroupId] ? current : { ...current, [activeGroupId]: true });
  }, [activeGroupId]);

  const toggleGroup = (groupId: string) => {
    if (groupId === activeGroupId) return;

    setExpanded((current) => {
      const next = { ...current, [groupId]: !current[groupId] };
      try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } catch {
        // Session persistence is an enhancement; navigation still works without it.
      }
      return next;
    });
  };

  const navigate = (key: ViewKey) => {
    onChange(key);
    onOpenChange(false);
  };

  return (
    <>
      <Button className="fixed right-4 top-4 z-50 lg:hidden" size="icon" onClick={() => onOpenChange(!open)} aria-label="منو">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {open && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => onOpenChange(false)}
          aria-label="بستن منو"
        />
      )}

      <aside
        className={cn(
          'fixed right-0 top-0 z-40 flex h-screen w-[275px] flex-col overflow-hidden border-l border-slate-800 bg-[#0b2134] text-white shadow-2xl transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/15 ring-1 ring-sky-400/30">
              <Building2 className="h-6 w-6 text-sky-300" />
            </div>
            <div>
              <div className="text-lg font-black">حسابداری</div>
              <div className="mt-1 text-xs text-slate-400">فاکتور، انبار و تسویه حساب</div>
            </div>
          </div>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3" aria-label="منوی اصلی">
          <div className="space-y-4">
            {sidebarGroups.map((group) => {
              const activeInside = group.id === activeGroupId;
              const isOpen = !group.collapsible || activeInside || expanded[group.id] !== false;
              const groupContentId = `sidebar-group-${group.id}`;

              return (
                <section key={group.id} aria-labelledby={`sidebar-group-label-${group.id}`}>
                  {group.collapsible ? (
                    <button
                      id={`sidebar-group-label-${group.id}`}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={groupContentId}
                      onClick={() => toggleGroup(group.id)}
                      className={cn(
                        'mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1 text-right text-[10px] font-black tracking-wide text-slate-500 transition hover:bg-white/5 hover:text-slate-300',
                        activeInside && 'text-sky-300'
                      )}
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 transition-transform duration-200',
                          !isOpen && '-rotate-90'
                        )}
                      />
                    </button>
                  ) : (
                    <div
                      id={`sidebar-group-label-${group.id}`}
                      className="mb-1 px-2 py-1 text-[10px] font-black tracking-wide text-slate-500"
                    >
                      {group.label}
                    </div>
                  )}

                  {isOpen && (
                    <div id={groupContentId} className="space-y-1">
                      {group.items.map(({ key, label, icon: Icon }) => {
                        const isActive = active === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => navigate(key)}
                            className={cn(
                              'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm transition',
                              isActive
                                ? 'bg-sky-500/16 text-white ring-1 ring-inset ring-sky-400/20'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white'
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-4.5 w-4.5 shrink-0',
                                isActive ? 'text-sky-300' : 'text-slate-400 group-hover:text-slate-200'
                              )}
                            />
                            <span className="flex-1">{label}</span>
                            {isActive && <ChevronLeft className="h-4 w-4 text-sky-300" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-400">
            <div className="mb-1 flex items-center gap-2 font-bold text-slate-200">
              <FileText className="h-4 w-4" /> ذخیره‌سازی محلی
            </div>
            داده‌ها فقط داخل مرورگر شما نگهداری می‌شوند.
          </div>
        </div>
      </aside>
    </>
  );
}
