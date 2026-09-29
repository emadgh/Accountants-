'use client';

import { useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { confirmDialog } from '@/lib/feedback';

export function useUnsavedDraft<T>(recordLabel: string) {
  const baseline = useRef<string | null>(null);

  const markClean = useCallback((draft: T) => {
    baseline.current = JSON.stringify(draft);
  }, []);

  const hasChanges = useCallback((draft: T | null) => (
    draft !== null && baseline.current !== null && JSON.stringify(draft) !== baseline.current
  ), []);

  const requestClose = useCallback(async (draft: T | null, close: () => void) => {
    if (hasChanges(draft)) {
      const confirmed = await confirmDialog(
        `تغییرات ${recordLabel} هنوز ذخیره نشده‌اند. بدون ذخیره بسته شوند؟`,
        { title: 'تغییرات ذخیره‌نشده', confirmLabel: 'بستن بدون ذخیره', cancelLabel: 'ادامه ویرایش', danger: true }
      );
      if (!confirmed) return;
    }
    close();
  }, [hasChanges, recordLabel]);

  return { markClean, hasChanges, requestClose };
}

export function UnsavedChangesBadge({ visible }: { visible: boolean }) {
  return visible ? <Badge className="bg-amber-50 text-amber-800">تغییرات ذخیره‌نشده</Badge> : null;
}
