import { toZonedTime } from "date-fns-tz";

const TIME_ZONE = "America/Sao_Paulo";

export function toZoned(date: Date | string | number): Date {
  const d =
    typeof date === "string" || typeof date === "number"
      ? new Date(date)
      : date;
  return toZonedTime(d, TIME_ZONE);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatDateOnly(date: Date | null | undefined): string | null {
  if (!date) return null;
  const z = toZoned(date);
  const yyyy = z.getFullYear();
  const mm = pad(z.getMonth() + 1);
  const dd = pad(z.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

export function formatBR(date: Date | null | undefined): string | null {
  if (!date) return null;
  const z = toZoned(date);
  const dd = pad(z.getDate());
  const mm = pad(z.getMonth() + 1);
  const yyyy = z.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export { TIME_ZONE };
