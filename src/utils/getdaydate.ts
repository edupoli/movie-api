import { toZoned } from "./date";

export function getDayDate(day: string | string[] | null): {
  dayName: string | string[] | null;
  targetDate: Date | Date[] | null;
} {
  if (!day) {
    return { dayName: null, targetDate: null };
  }

  // Se for um array de dias, processa cada um
  if (Array.isArray(day)) {
    const days = day.map((d) => getSingleDayDate(d));
    return {
      dayName: days.map((d) => d.dayName).filter((d) => d !== null) as string[],
      targetDate: days
        .map((d) => d.targetDate)
        .filter((d) => d !== null) as Date[],
    };
  }

  return getSingleDayDate(day);
}

function getSingleDayDate(day: string): {
  dayName: string | null;
  targetDate: Date | null;
} {
  // Data/hora atual no fuso de Brasília (America/Sao_Paulo)
  const now = toZoned(new Date());
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
    const targetDate = new Date(now.getTime());
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
    const targetDate = new Date(now.getTime());
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
    targetDate = toZoned(
      new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr))
    );
  } else if (shortDateMatch) {
    const [, dayStr, monthStr] = shortDateMatch;
    targetDate = toZoned(
      new Date(currentYear, parseInt(monthStr) - 1, parseInt(dayStr))
    );
    if (targetDate < now) {
      targetDate.setFullYear(currentYear + 1);
    }
  } else if (dayOnlyMatch) {
    const [, dayStr] = dayOnlyMatch;
    const dayNum = parseInt(dayStr);
    targetDate = toZoned(new Date(currentYear, currentMonth, dayNum));

    if (targetDate <= now) {
      targetDate = toZoned(new Date(currentYear, currentMonth + 1, dayNum));
    }

    const twoWeeksLater = new Date(now.getTime());
    twoWeeksLater.setDate(now.getDate() + 14);

    if (targetDate > twoWeeksLater) {
      const currentMonthOption = toZoned(
        new Date(currentYear, currentMonth, dayNum)
      );
      if (currentMonthOption > now) {
        targetDate = currentMonthOption;
      }
    }
  }

  if (targetDate && !isNaN(targetDate.getTime())) {
    const twoMonthsLater = new Date(now.getTime());
    twoMonthsLater.setMonth(now.getMonth() + 2);

    if (targetDate >= now && targetDate <= twoMonthsLater) {
      return { dayName: reverseDayMap[targetDate.getDay()], targetDate };
    }
  }

  return { dayName: null, targetDate: null };
}
