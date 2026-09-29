export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export type FeedbackDialogRequest =
  | {
      id: string;
      mode: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
    }
  | {
      id: string;
      mode: 'prompt';
      title: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
      placeholder?: string;
      initialValue?: string;
    };

type DialogResult = boolean | string | null;
const pending = new Map<string, (value: DialogResult) => void>();

function eventId() {
  return 'feedback_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function dispatchDialog(request: FeedbackDialogRequest) {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise<DialogResult>((resolve) => {
    pending.set(request.id, resolve);
    window.dispatchEvent(new CustomEvent<FeedbackDialogRequest>('accountants:feedback-dialog', { detail: request }));
  });
}

export function notify(message: string, tone: ToastTone = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('accountants:toast', { detail: { message, tone } }));
}

export function confirmDialog(
  message: string,
  options: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}
) {
  const id = eventId();
  return dispatchDialog({
    id,
    mode: 'confirm',
    title: options.title || 'تایید عملیات',
    message,
    confirmLabel: options.confirmLabel || 'تایید',
    cancelLabel: options.cancelLabel || 'انصراف',
    danger: !!options.danger,
  }).then((value) => value === true);
}

export function promptDialog(
  message: string,
  options: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; placeholder?: string; initialValue?: string } = {}
) {
  const id = eventId();
  return dispatchDialog({
    id,
    mode: 'prompt',
    title: options.title || 'ورود اطلاعات',
    message,
    confirmLabel: options.confirmLabel || 'تایید',
    cancelLabel: options.cancelLabel || 'انصراف',
    danger: !!options.danger,
    placeholder: options.placeholder,
    initialValue: options.initialValue,
  }).then((value) => typeof value === 'string' ? value : null);
}

export function completeFeedbackDialog(id: string, value: DialogResult) {
  const resolve = pending.get(id);
  if (!resolve) return;
  pending.delete(id);
  resolve(value);
}
