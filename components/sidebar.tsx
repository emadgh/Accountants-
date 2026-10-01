'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sidebarGroups, type ViewKey } from '@/components/sidebar-config';
import { BranchedMenu, type BranchedMenuGroup } from '@/components/branched-menu';

export type { ViewKey } from '@/components/sidebar-config';

const defaultExpanded = Object.fromEntries(
  sidebarGroups.filter((group) => group.collapsible).map((group) => [group.id, true])
) as Record<string, boolean>;

const SESSION_KEY = 'accountants:sidebar-groups';
const branchedMenuItems: readonly BranchedMenuGroup[] = sidebarGroups.map((group) => ({
  id: group.id,
  label: group.label,
  collapsible: group.collapsible,
  children: group.items.map(({ key, label, icon }) => ({ value: key, label, icon })),
}));

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
  const openSections = useMemo(() => new Set(sidebarGroups.flatMap((group, index) => {
    const activeInside = group.id === activeGroupId;
    const isOpen = !group.collapsible || activeInside || expanded[group.id] !== false;
    return isOpen ? [index] : [];
  })), [activeGroupId, expanded]);

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

  const toggleMenuGroup = (index: number) => {
    const group = sidebarGroups[index];
    if (group?.collapsible) toggleGroup(group.id);
  };

  return (
    <>
      {open && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => onOpenChange(false)}
          aria-label="بستن منو"
        />
      )}

      <aside
        className={cn(
          'fixed right-0 top-0 z-40 flex h-screen w-[275px] flex-col overflow-hidden border-l border-slate-800/80 bg-[#0b2134]/90 text-white shadow-2xl transition-transform lg:translate-x-0',
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
          <BranchedMenu
            items={branchedMenuItems}
            activeValue={active}
            openSections={openSections}
            onSelect={(value) => navigate(value as ViewKey)}
            onToggle={toggleMenuGroup}
            className="gap-2"
          />
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-400">
            <div className="mb-1 flex items-center gap-2 font-bold text-slate-200">
              <FileText className="h-4 w-4" /> ذخیره‌سازی روی سرور
            </div>
            داده‌ها و پیوست‌ها روی دیسک سرور نگهداری می‌شوند.
          </div>
        </div>
      </aside>
    </>
  );
}
