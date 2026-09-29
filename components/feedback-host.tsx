'use client';

import { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/sonner';
import type { FeedbackDialogRequest, ToastTone } from '@/lib/feedback';
import { completeFeedbackDialog } from '@/lib/feedback';
import { toast } from 'sonner';

export function FeedbackHost() {
  const [dialog, setDialog] = useState<FeedbackDialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; tone?: ToastTone }>).detail;
      if (!detail?.message) return;

      switch (detail.tone || 'info') {
        case 'success': toast.success(detail.message); break;
        case 'error': toast.error(detail.message); break;
        case 'warning': toast.warning(detail.message); break;
        default: toast.info(detail.message);
      }
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

  return (
    <>
      <Toaster />

      <AlertDialog
        open={dialog?.mode === 'confirm'}
        onOpenChange={(open) => !open && dialog?.mode === 'confirm' && finish(false)}
      >
        {dialog?.mode === 'confirm' && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className={dialog.danger ? 'text-lg font-black text-rose-700' : 'text-lg font-black'}>
                {dialog.title}
              </AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
                {dialog.message}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="outline" onClick={(event) => { event.preventDefault(); finish(false); }}>
                  {dialog.cancelLabel}
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant={dialog.danger ? 'danger' : 'default'}
                  onClick={(event) => { event.preventDefault(); finish(true); }}
                >
                  {dialog.confirmLabel}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <Dialog
        open={dialog?.mode === 'prompt'}
        onOpenChange={(open) => !open && dialog?.mode === 'prompt' && finish(null)}
      >
        {dialog?.mode === 'prompt' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className={dialog.danger ? 'text-lg font-black text-rose-700' : 'text-lg font-black'}>
                {dialog.title}
              </DialogTitle>
              <DialogDescription className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
                {dialog.message}
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={promptValue}
              placeholder={dialog.placeholder}
              onChange={(event) => setPromptValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && promptValue.trim()) finish(promptValue);
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => finish(null)}>{dialog.cancelLabel}</Button>
              <Button
                variant={dialog.danger ? 'danger' : 'default'}
                disabled={!promptValue.trim()}
                onClick={() => finish(promptValue)}
              >
                {dialog.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
