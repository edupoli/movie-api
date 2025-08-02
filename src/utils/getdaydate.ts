export function getDayDate(day: string | null): {
  dayName: string | null;
  targetDate: Date | null;
} {
  if (!day) {
    return { dayName: null, targetDate: null };
  }

  // Normaliza o dia para minúsculas e remove acentos
  const normalizedDay = day
    .toLowerCase()
    .replace(/[áàãâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòõôö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ç/g, "c");

  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const currentDay = currentDate.getDate();

  // Mapeamento de dias com variações de escrita
  const dayMap: { [key: string]: number } = {
    domingo: 0,
    segunda: 1,
    "segunda-feira": 1,
    terca: 2,
    terça: 2,
    "terca-feira": 2,
    "terça-feira": 2,
    quarta: 3,
    "quarta-feira": 3,
    quinta: 4,
    "quinta-feira": 4,
    sexta: 5,
    "sexta-feira": 5,
    sabado: 6,
    sábado: 6,
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

  const today = currentDate.getDay();
  console.log("normalizedDay", normalizedDay);

  // Trata casos especiais
  if (normalizedDay === "hoje") {
    const dayName = reverseDayMap[today];
    return { dayName, targetDate: currentDate };
  } else if (normalizedDay === "amanha" || normalizedDay === "amanhã") {
    const targetDate = new Date(currentDate);
    targetDate.setDate(currentDate.getDate() + 1);
    const dayName = reverseDayMap[targetDate.getDay()];
    return { dayName, targetDate };
  } else if (normalizedDay === "semana") {
    // Semana completa: não filtra por dia
    return { dayName: null, targetDate: null };
  } else if (
    normalizedDay === "fim_de_semana" ||
    normalizedDay === "final_de_semana"
  ) {
    // Fim de semana: valor especial para tratamento na query
    return { dayName: "fim_de_semana", targetDate: null };
  }

  // Trata dias da semana por nome
  if (normalizedDay in dayMap) {
    const targetDay = dayMap[normalizedDay];
    const targetDate = new Date(currentDate);
    const daysToAdd = (targetDay - today + 7) % 7;
    const offset = daysToAdd === 0 ? 7 : daysToAdd;
    targetDate.setDate(currentDate.getDate() + offset);
    const dayName = reverseDayMap[targetDate.getDay()];
    return { dayName, targetDate };
  }

  // Tratamento de datas numéricas
  const fullDateMatch = day.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const shortDateMatch = day.match(/^(\d{2})\/(\d{2})$/);
  const dayOnlyMatch = day.match(/^(\d{1,2})$/);

  let targetDate: Date | null = null;

  if (fullDateMatch) {
    const [, dayStr, monthStr, yearStr] = fullDateMatch;
    targetDate = new Date(
      parseInt(yearStr),
      parseInt(monthStr) - 1,
      parseInt(dayStr)
    );
  } else if (shortDateMatch) {
    const [, dayStr, monthStr] = shortDateMatch;
    targetDate = new Date(
      currentYear,
      parseInt(monthStr) - 1,
      parseInt(dayStr)
    );
    if (targetDate < currentDate) {
      targetDate.setFullYear(currentYear + 1);
    }
  } else if (dayOnlyMatch) {
    const [, dayStr] = dayOnlyMatch;
    const dayNum = parseInt(dayStr);

    // Primeiro tenta no mês atual
    targetDate = new Date(currentYear, currentMonth, dayNum);

    // Se a data já passou ou é hoje, tenta no próximo mês
    if (targetDate <= currentDate) {
      targetDate = new Date(currentYear, currentMonth + 1, dayNum);
    }

    // Se ainda assim a data for muito distante, tenta no mês atual do próximo ano
    const twoWeeksLater = new Date(currentDate);
    twoWeeksLater.setDate(currentDate.getDate() + 14);

    if (targetDate > twoWeeksLater) {
      // Se passou de 2 semanas, tenta no mês atual
      const currentMonthOption = new Date(currentYear, currentMonth, dayNum);
      if (currentMonthOption > currentDate) {
        targetDate = currentMonthOption;
      }
    }
  }

  if (targetDate && !isNaN(targetDate.getTime())) {
    // Validação mais flexível: aceita datas até 2 meses no futuro para casos específicos
    const twoMonthsLater = new Date(currentDate);
    twoMonthsLater.setMonth(currentDate.getMonth() + 2);

    if (targetDate >= currentDate && targetDate <= twoMonthsLater) {
      const dayName = reverseDayMap[targetDate.getDay()];
      return { dayName, targetDate };
    }
  }

  return { dayName: null, targetDate: null };
}
