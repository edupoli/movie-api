import { toZonedTime } from "date-fns-tz";

export function getDayDate(day: string | null): {
  dayName: string | null;
  targetDate: Date | null;
} {
  if (!day) {
    return { dayName: null, targetDate: null };
  }

  const timeZone = "America/Sao_Paulo";

  // Data/hora atual no fuso de Brasília
  const now = toZonedTime(new Date(), timeZone);
  now.setHours(0, 0, 0, 0); // Zera no horário de Brasília

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  // Normaliza o texto do dia
  const normalizedDay = day
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const dayMap: { [key: string]: number } = {
    domingo: 0,
    segunda: 1,
    "segunda-feira": 1,
    terca: 2,
    "terca-feira": 2,
    quarta: 3,
    "quarta-feira": 3,
    quinta: 4,
    "quinta-feira": 4,
    sexta: 5,
    "sexta-feira": 5,
    sabado: 6,
    "sabado-feira": 6,
  };

  const reverseDayMap: { [key: number]: string } = {
    0: "domingo",
    1: "segunda",
    2: "terca",
    3: "quarta",
    4: "quinta",
    5: "sexta",
    6: "sabado",
  };

  const today = now.getDay();

  // Casos especiais
  if (normalizedDay === "hoje") {
    return { dayName: reverseDayMap[today], targetDate: now };
  }

  if (normalizedDay === "amanha") {
    const targetDate = toZonedTime(new Date(now), timeZone);
    targetDate.setDate(now.getDate() + 1);
    return { dayName: reverseDayMap[targetDate.getDay()], targetDate };
  }

  if (normalizedDay === "semana") {
    return { dayName: null, targetDate: null };
  }

  if (
    normalizedDay === "fim_de_semana" ||
    normalizedDay === "final_de_semana"
  ) {
    return { dayName: "fim_de_semana", targetDate: null };
  }

  // Dias da semana
  if (normalizedDay in dayMap) {
    const targetDay = dayMap[normalizedDay];
    const targetDate = toZonedTime(new Date(now), timeZone);
    const daysToAdd = (targetDay - today + 7) % 7;
    const offset = daysToAdd === 0 ? 7 : daysToAdd;
    targetDate.setDate(now.getDate() + offset);
    return { dayName: reverseDayMap[targetDate.getDay()], targetDate };
  }

  // Datas numéricas
  const fullDateMatch = day.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const shortDateMatch = day.match(/^(\d{2})\/(\d{2})$/);
  const dayOnlyMatch = day.match(/^(\d{1,2})$/);

  let targetDate: Date | null = null;

  if (fullDateMatch) {
    const [, dayStr, monthStr, yearStr] = fullDateMatch;
    targetDate = toZonedTime(
      new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr)),
      timeZone
    );
  } else if (shortDateMatch) {
    const [, dayStr, monthStr] = shortDateMatch;
    targetDate = toZonedTime(
      new Date(currentYear, parseInt(monthStr) - 1, parseInt(dayStr)),
      timeZone
    );
    if (targetDate < now) {
      targetDate.setFullYear(currentYear + 1);
    }
  } else if (dayOnlyMatch) {
    const [, dayStr] = dayOnlyMatch;
    const dayNum = parseInt(dayStr);
    targetDate = toZonedTime(
      new Date(currentYear, currentMonth, dayNum),
      timeZone
    );

    if (targetDate <= now) {
      targetDate = toZonedTime(
        new Date(currentYear, currentMonth + 1, dayNum),
        timeZone
      );
    }

    const twoWeeksLater = toZonedTime(new Date(now), timeZone);
    twoWeeksLater.setDate(now.getDate() + 14);

    if (targetDate > twoWeeksLater) {
      const currentMonthOption = toZonedTime(
        new Date(currentYear, currentMonth, dayNum),
        timeZone
      );
      if (currentMonthOption > now) {
        targetDate = currentMonthOption;
      }
    }
  }

  if (targetDate && !isNaN(targetDate.getTime())) {
    const twoMonthsLater = toZonedTime(new Date(now), timeZone);
    twoMonthsLater.setMonth(now.getMonth() + 2);

    if (targetDate >= now && targetDate <= twoMonthsLater) {
      return { dayName: reverseDayMap[targetDate.getDay()], targetDate };
    }
  }

  return { dayName: null, targetDate: null };
}
