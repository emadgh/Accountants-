'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { FeedbackDialogRequest, ToastTone } from '@/lib/feedback';
import { completeFeedbackDialog } from '@/lib/feedback';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type ToastItem = { id: string; message: string; tone: ToastTone };

export function FeedbackHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<FeedbackDialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; tone: ToastTone }>).detail;
      if (!detail?.message) return;
      const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      setToasts((items) => [...items.slice(-3), { id, message: detail.message, tone: detail.tone || 'info' }]);
      window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200);
    };
    const onDialog = (event: Event) => {
      const request = (event as CustomEvent<FeedbackDialogRequest>).detail;
      if (!request) return;
      setDialog(request);
      setPromptValue(request.mode === 'prompt' ? request.initialValue || '' : '');
    };
    window.addEventListener('accountants:toast', onToast);
    window.addEventListener('accountants:feedback-dialog', onDialog);
    return () => {
      window.removeEventListener('accountants:toast', onToast);
      window.removeEventListener('accountants:feedback-dialog', onDialog);
    };
  }, []);

  const finish = (value: boolean | string | null) => {
    if (!dialog) return;
    completeFeedbackDialog(dialog.id, value);
    setDialog(null);
    setPromptValue('');
  };

  return <>
    <div className="screen-only pointer-events-none fixed left-4 top-4 z-[120] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => <div key={toast.id} className={'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-xl ' + toneClass(toast.tone)} role={toast.tone === 'error' ? 'alert' : 'status'}>
        <div className="mt-0.5">{toneIcon(toast.tone)}</div>
        <div className="min-w-0 flex-1 text-sm font-bold leading-6">{toast.message}</div>
        <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="بستن اعلان" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><X className="h-4 w-4" /></button>
      </div>)}
    </div>

    <Dialog open={!!dialog} onOpenChange={(open) => !open && finish(dialog?.mode === 'prompt' ? null : false)}>
      <DialogContent>
        {dialog && <>
          <DialogHeader>
            <DialogTitle className={dialog.danger ? 'text-lg font-black text-rose-700' : 'text-lg font-black'}>{dialog.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{dialog.message}</DialogDescription>
          </DialogHeader>
          {dialog.mode === 'prompt' && <Input autoFocus value={promptValue} placeholder={dialog.placeholder} onChange={(event) => setPromptValue(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && promptValue.trim()) finish(promptValue);
          }} />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => finish(dialog.mode === 'prompt' ? null : false)}>{dialog.cancelLabel}</Button>
            <Button variant={dialog.danger ? 'danger' : 'default'} disabled={dialog.mode === 'prompt' && !promptValue.trim()} onClick={() => finish(dialog.mode === 'prompt' ? promptValue : true)}>{dialog.confirmLabel}</Button>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}

function toneClass(tone: ToastTone) {
  if (tone === 'success') return 'border-emerald-200 text-emerald-800';
  if (tone === 'error') return 'border-rose-200 text-rose-800';
  if (tone === 'warning') return 'border-amber-200 text-amber-800';
  return 'border-sky-200 text-sky-800';
}

function toneIcon(tone: ToastTone) {
  if (tone === 'success') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (tone === 'error') return <XCircle className="h-5 w-5 text-rose-600" />;
  if (tone === 'warning') return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  return <Info className="h-5 w-5 text-sky-600" />;
}
