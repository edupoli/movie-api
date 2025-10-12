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

export function processMultipleDays(days: string[] | null): string[] | null {
  if (!days || days.length === 0) return null;

  const today = new Date();
  const result = new Set<string>();

  days.forEach((day) => {
    switch (day.toLowerCase()) {
      case "hoje":
        const weekDays = [
          "domingo",
          "segunda",
          "terca",
          "quarta",
          "quinta",
          "sexta",
          "sabado",
        ];
        result.add(weekDays[today.getDay()]);
        break;
      case "amanha":
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        result.add(weekDays[tomorrow.getDay()]);
        break;
      default:
        if (
          [
            "segunda",
            "terca",
            "quarta",
            "quinta",
            "sexta",
            "sabado",
            "domingo",
          ].includes(day.toLowerCase())
        ) {
          result.add(day.toLowerCase());
        }
    }
  });

  return result.size > 0 ? Array.from(result) : null;
}

export { TIME_ZONE };
