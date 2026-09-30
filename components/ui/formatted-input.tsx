'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toEnglishDigits } from '@/lib/standards';

type SharedProps = Omit<React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'inputMode' | 'min' | 'max' | 'step' | 'maxLength'> & {
    min?: number | string;
    max?: number | string;
    step?: number | string;
    unstyled?: boolean;
  };

type NumericProps = SharedProps & {
  format?: 'number';
  value: number | string | null | undefined;
  onValueChange: (value: number) => void;
  allowDecimal?: boolean;
  allowNegative?: boolean;
};

export type TextInputFormat = 'card' | 'postalCode' | 'nationalId' | 'economicCode' | 'iban';

type FormattedTextProps = SharedProps & {
  format: TextInputFormat;
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  maxDigits?: number;
};

export type FormattedInputProps = NumericProps | FormattedTextProps;

function isFormattedTextProps(props: FormattedInputProps): props is FormattedTextProps {
  return props.format !== undefined && props.format !== 'number';
}

const FORMAT_MAX_DIGITS: Record<Exclude<TextInputFormat, 'card'>, number> = {
  postalCode: 10,
  nationalId: 11,
  economicCode: 14,
  iban: 24,
};

function normalizeDigits(value: string) {
  return toEnglishDigits(value).replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function onlyCardDigits(value: string, maxDigits: number) {
  return normalizeDigits(value).replace(/\D/g, '').slice(0, maxDigits);
}

function textFormatMaxDigits(format: TextInputFormat, customMaxDigits?: number) {
  if (format === 'card') return Math.max(1, customMaxDigits || 16);
  return FORMAT_MAX_DIGITS[format];
}

function cleanFormattedText(value: string, format: TextInputFormat, maxDigits: number) {
  const normalized = normalizeDigits(value).toUpperCase();
  if (format === 'iban') {
    const digits = normalized.replace(/^IR/, '').replace(/\D/g, '').slice(0, maxDigits);
    return digits ? `IR${digits}` : '';
  }
  return normalized.replace(/\D/g, '').slice(0, maxDigits);
}

function cleanNumber(value: string, allowDecimal: boolean, allowNegative: boolean) {
  const normalized = normalizeDigits(value)
    .replace(/[٬,،\s\u00a0]/g, '')
    .replace(/[٫]/g, '.')
    .replace(/[−–]/g, '-');
  const negative = allowNegative && normalized.startsWith('-');
  let body = normalized.replace(/-/g, '').replace(/[^\d.]/g, '');

  if (!allowDecimal) {
    body = body.replace(/\./g, '');
  } else {
    const decimalIndex = body.indexOf('.');
    if (decimalIndex >= 0) body = body.slice(0, decimalIndex + 1) + body.slice(decimalIndex + 1).replace(/\./g, '');
  }

  return (negative ? '-' : '') + body;
}

function formatGroupedNumber(value: string) {
  if (!value) return '';
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const decimalIndex = unsigned.indexOf('.');
  const integer = decimalIndex >= 0 ? unsigned.slice(0, decimalIndex) : unsigned;
  const fraction = decimalIndex >= 0 ? unsigned.slice(decimalIndex + 1) : null;
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + groupedInteger + (fraction === null ? '' : '.' + fraction);
}

export function formatCardNumber(value: string | null | undefined, maxDigits = 16) {
  const digits = onlyCardDigits(String(value || ''), maxDigits);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatIranIban(value: string | null | undefined) {
  const digits = cleanFormattedText(String(value || ''), 'iban', FORMAT_MAX_DIGITS.iban).replace(/^IR/, '');
  const groupedDigits = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  return groupedDigits ? `IR ${groupedDigits}` : 'IR';
}

export function formatPostalCode(value: string | null | undefined) {
  const digits = cleanFormattedText(String(value || ''), 'postalCode', FORMAT_MAX_DIGITS.postalCode);
  return digits.replace(/(\d{5})(?=\d)/g, '$1 ');
}

function formatTextValue(value: string | null | undefined, format: TextInputFormat, maxDigits: number) {
  if (format === 'card') return formatCardNumber(value, maxDigits);
  if (format === 'postalCode') return formatPostalCode(value);
  if (format === 'iban') return formatIranIban(value);
  return cleanFormattedText(String(value || ''), format, maxDigits);
}

function parseNumber(value: string) {
  if (!value || value === '-' || value === '.' || value === '-.') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericAttribute(value: number | string | undefined) {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function selectionPosition(formatted: string, rawCharacterCount: number, format: TextInputFormat | 'number') {
  if (rawCharacterCount <= 0) return format === 'iban' ? Math.min(3, formatted.length) : 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (format === 'number' ? /[\d.-]/.test(formatted[index]) : /\d/.test(formatted[index])) seen += 1;
    if (seen === rawCharacterCount) return index + 1;
  }
  return formatted.length;
}

function initialDisplay(props: FormattedInputProps) {
  if (isFormattedTextProps(props)) return formatTextValue(props.value, props.format, textFormatMaxDigits(props.format, props.maxDigits));
  const raw = cleanNumber(String(props.value ?? ''), props.allowDecimal ?? true, props.allowNegative ?? false);
  return formatGroupedNumber(raw);
}

function nativeInputProps(props: FormattedInputProps): React.InputHTMLAttributes<HTMLInputElement> {
  if (isFormattedTextProps(props)) {
    const { format: _format, value: _value, onValueChange: _onValueChange, maxDigits: _maxDigits, min: _min, max: _max, step: _step, unstyled: _unstyled, className: _className, ...inputProps } = props;
    return inputProps;
  }

  const { format: _format, value: _value, onValueChange: _onValueChange, allowDecimal: _allowDecimal, allowNegative: _allowNegative, min: _min, max: _max, step: _step, unstyled: _unstyled, className: _className, ...inputProps } = props;
  return inputProps;
}

export const FormattedInput = React.forwardRef<HTMLInputElement, FormattedInputProps>((props, forwardedRef) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const focused = React.useRef(false);
  const pendingCaret = React.useRef<number | null>(null);
  const [displayValue, setDisplayValue] = React.useState(() => initialDisplay(props));
  const textProps = isFormattedTextProps(props) ? props : null;
  const isTextFormat = !!textProps;
  const textFormat = textProps?.format || null;
  const allowDecimal = textProps ? false : (props as NumericProps).allowDecimal ?? true;
  const allowNegative = textProps ? false : (props as NumericProps).allowNegative ?? false;
  const maxDigits = textProps ? textFormatMaxDigits(textProps.format, textProps.maxDigits) : 0;

  React.useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement, []);

  React.useEffect(() => {
    if (!focused.current) setDisplayValue(initialDisplay(props));
  }, [props.value, props.format, textProps?.maxDigits, textProps?.format, 'allowDecimal' in props ? props.allowDecimal : undefined, 'allowNegative' in props ? props.allowNegative : undefined]);

  React.useLayoutEffect(() => {
    const position = pendingCaret.current;
    if (!focused.current || position === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(position, position);
    pendingCaret.current = null;
  }, [displayValue]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const source = input.value;
    const sourceCaret = input.selectionStart ?? source.length;
    const beforeCaret = source.slice(0, sourceCaret);
    const raw = textFormat
      ? cleanFormattedText(source, textFormat, maxDigits)
      : cleanNumber(source, allowDecimal, allowNegative);
    const rawBeforeCaret = textFormat
      ? cleanFormattedText(beforeCaret, textFormat, maxDigits)
      : cleanNumber(beforeCaret, allowDecimal, allowNegative);
    const nextDisplay = textFormat ? formatTextValue(raw, textFormat, maxDigits) : formatGroupedNumber(raw);
    const rawCaretCount = textFormat === 'iban' ? rawBeforeCaret.replace(/^IR/, '').length : rawBeforeCaret.length;
    const nextCaret = selectionPosition(nextDisplay, rawCaretCount, textFormat || 'number');

    pendingCaret.current = nextCaret;
    if (nextDisplay === displayValue) {
      input.value = nextDisplay;
      input.setSelectionRange(nextCaret, nextCaret);
      pendingCaret.current = null;
    } else {
      setDisplayValue(nextDisplay);
    }

    if (isFormattedTextProps(props)) {
      props.onValueChange(raw);
    } else {
      const numericValue = parseNumber(raw);
      if (numericValue !== null) props.onValueChange(numericValue);
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    focused.current = false;
    pendingCaret.current = null;
    if (isFormattedTextProps(props)) {
      const formattedValue = cleanFormattedText(event.currentTarget.value, props.format, maxDigits);
      props.onValueChange(formattedValue);
      setDisplayValue(formatTextValue(formattedValue, props.format, maxDigits));
    } else {
      const raw = cleanNumber(event.currentTarget.value, allowDecimal, allowNegative);
      const committedValue = parseNumber(raw) ?? 0;
      props.onValueChange(committedValue);
      setDisplayValue(formatGroupedNumber(String(committedValue)));
    }
    props.onBlur?.(event);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    props.onKeyDown?.(event);
    if (isFormattedTextProps(props) || event.defaultPrevented || props.readOnly || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;

    const current = parseNumber(cleanNumber(displayValue, allowDecimal, allowNegative)) ?? 0;
    const requestedStep = props.step === 'any' ? 1 : numericAttribute(props.step) ?? 1;
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const min = numericAttribute(props.min);
    const max = numericAttribute(props.max);
    const next = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, current + direction * requestedStep));

    event.preventDefault();
    props.onValueChange(next);
    setDisplayValue(formatGroupedNumber(String(next)));
  };

  const { min, max, step, unstyled, className, dir, onFocus } = props;
  const inputProps = nativeInputProps(props);

  const fieldProps: React.InputHTMLAttributes<HTMLInputElement> = {
    ...inputProps,
    type: 'text',
    value: displayValue,
    onChange: handleChange,
    onFocus: (event) => {
      focused.current = true;
      onFocus?.(event);
    },
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    dir: dir || 'ltr',
    inputMode: isTextFormat ? 'numeric' : allowDecimal ? 'decimal' : 'numeric',
    role: isTextFormat ? undefined : 'spinbutton',
    'aria-valuemin': isTextFormat ? undefined : numericAttribute(min),
    'aria-valuemax': isTextFormat ? undefined : numericAttribute(max),
    'aria-valuenow': isTextFormat ? undefined : parseNumber(cleanNumber(displayValue, allowDecimal, allowNegative)) ?? undefined,
    maxLength: textFormat === 'iban' ? 32 : textFormat === 'card' ? maxDigits + Math.floor((maxDigits - 1) / 4) : textFormat === 'postalCode' ? 11 : textFormat ? maxDigits : undefined,
    autoComplete: textFormat === 'card' ? 'cc-number' : inputProps.autoComplete,
    className: unstyled ? className : cn(isTextFormat ? 'text-left' : 'text-right', className),
  };

  if (unstyled) return <input {...fieldProps} ref={inputRef} />;
  return <Input {...fieldProps} ref={inputRef} />;
});

FormattedInput.displayName = 'FormattedInput';
