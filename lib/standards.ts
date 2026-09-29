import type { DocumentSequenceConfig } from './types';

export function toEnglishDigits(value: string) {
  return (value || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export function toPersianDigits(value: string | number) {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

function div(a: number, b: number) {
  return Math.floor(a / b);
}

function gregorianToJalali(gy: number, gm: number, gd: number) {
  const gdm = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  gy -= 1600;
  gm -= 1;
  gd -= 1;
  let gDayNo = 365 * gy + div(gy + 3, 4) - div(gy + 99, 100) + div(gy + 399, 400);
  for (let i = 0; i < gm; ++i) gDayNo += gdm[i];
  if (gm > 1 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) gDayNo++;
  gDayNo += gd;

  let jDayNo = gDayNo - 79;
  const jNp = div(jDayNo, 12053);
  jDayNo %= 12053;
  let jy = 979 + 33 * jNp + 4 * div(jDayNo, 1461);
  jDayNo %= 1461;
  if (jDayNo >= 366) {
    jy += div(jDayNo - 1, 365);
    jDayNo = (jDayNo - 1) % 365;
  }
  const jm = jDayNo < 186 ? 1 + div(jDayNo, 31) : 7 + div(jDayNo - 186, 30);
  const jd = 1 + (jDayNo < 186 ? jDayNo % 31 : (jDayNo - 186) % 30);
  return { jy, jm, jd };
}

function jalaliToGregorian(jy: number, jm: number, jd: number) {
  jy += 1595;
  let days = -355668 + 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4) + jd;
  days += jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186;

  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const months = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > months[gm]) {
    gd -= months[gm];
    gm++;
  }
  return { gy, gm, gd };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeStoredDate(value: string) {
  const raw = toEnglishDigits(value || '').trim();
  if (!raw || raw === 'ابتدای دوره') return value;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];

  const match = raw.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year >= 1700) return year + '-' + pad(month) + '-' + pad(day);
  if (year < 1200 || month < 1 || month > 12 || day < 1 || day > 31) return value;
  const g = jalaliToGregorian(year, month, day);
  return g.gy + '-' + pad(g.gm) + '-' + pad(g.gd);
}

export function formatPersianDate(value: string) {
  if (!value || value === 'ابتدای دوره') return value || '—';
  const normalized = normalizeStoredDate(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const j = gregorianToJalali(Number(match[1]), Number(match[2]), Number(match[3]));
  return toPersianDigits(j.jy + '/' + pad(j.jm) + '/' + pad(j.jd));
}

export function persianInputToIso(value: string) {
  const normalized = normalizeStoredDate(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export function formatDocumentNumber(config: DocumentSequenceConfig) {
  const next = Math.max(1, Math.floor(Number(config.next || 1)));
  const padding = Math.min(12, Math.max(1, Math.floor(Number(config.padding || 1))));
  return (config.prefix || '') + String(next).padStart(padding, '0');
}

export function validateNationalId(value: string) {
  const code = toEnglishDigits(value).replace(/\D/g, '');
  if (!code) return true;
  if (/^(\d)\1+$/.test(code)) return false;
  if (/^\d{11}$/.test(code)) return true; // شناسه ملی اشخاص حقوقی؛ کنترل ساختاری
  if (!/^\d{10}$/.test(code)) return false;
  const check = Number(code[9]);
  const sum = code.slice(0, 9).split('').reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return check === (remainder < 2 ? remainder : 11 - remainder);
}

export function validatePostalCode(value: string) {
  const code = toEnglishDigits(value).replace(/\D/g, '');
  if (!code) return true;
  return /^\d{10}$/.test(code) && !/^(\d)\1{9}$/.test(code);
}

export function validateEconomicCode(value: string) {
  const code = toEnglishDigits(value).replace(/\D/g, '');
  if (!code) return true;
  return /^\d{11,14}$/.test(code);
}

export function validateCardNumber(value: string) {
  const card = toEnglishDigits(value).replace(/\D/g, '');
  if (!card) return true;
  if (!/^\d{16}$/.test(card) || /^0{8,}/.test(card)) return false;
  const sum = card.split('').reduce((total, digit, index) => {
    const weight = index % 2 === 0 ? 2 : 1;
    const product = Number(digit) * weight;
    return total + (product > 9 ? product - 9 : product);
  }, 0);
  return sum % 10 === 0;
}

export function validateIban(value: string) {
  const iban = toEnglishDigits(value).replace(/\s+/g, '').toUpperCase();
  if (!iban) return true;
  if (!/^IR\d{24}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

export function validateOfficialFields(data: {
  nationalId?: string;
  economicCode?: string;
  postalCode?: string;
  cardNumber?: string;
  iban?: string;
}) {
  const errors: string[] = [];
  if (!validateNationalId(data.nationalId || '')) errors.push('کد ملی/شناسه ملی باید معتبر و ۱۰ یا ۱۱ رقمی باشد.');
  if (!validateEconomicCode(data.economicCode || '')) errors.push('کد اقتصادی باید ۱۱ تا ۱۴ رقم باشد.');
  if (!validatePostalCode(data.postalCode || '')) errors.push('کد پستی باید ۱۰ رقم معتبر باشد.');
  if (!validateCardNumber(data.cardNumber || '')) errors.push('شماره کارت معتبر نیست.');
  if (!validateIban(data.iban || '')) errors.push('شماره شبا معتبر نیست.');
  return errors;
}
