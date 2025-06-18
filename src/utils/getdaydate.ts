export function getDayDate(day: string): { dayName: string; targetDate: Date } {
  const currentDate = new Date();
  const dayMap: { [key: string]: number } = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
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

  const today = currentDate.getDay(); // 0 (Domingo) a 6 (Sábado)
  let targetDate = new Date(currentDate);

  if (day === "hoje") {
    const dayName = reverseDayMap[today];
    return { dayName, targetDate: targetDate };
  } else if (day === "amanha") {
    targetDate.setDate(targetDate.getDate() + 1);
    const tomorrow = targetDate.getDay();
    const dayName = reverseDayMap[tomorrow];
    return { dayName, targetDate: targetDate };
  } else if (day === "semana") {
    // Encontrar a próxima segunda-feira
    const daysUntilNextMonday = (1 - today + 7) % 7 || 7;
    targetDate.setDate(targetDate.getDate() + daysUntilNextMonday);
    const dayName = reverseDayMap[targetDate.getDay()];
    return { dayName, targetDate: targetDate };
  } else if (day in dayMap) {
    const targetDay = dayMap[day];
    const daysToAdd = (targetDay - today + 7) % 7;
    // Se for hoje, retorna a próxima semana
    const offset = daysToAdd === 0 ? 7 : daysToAdd;
    targetDate.setDate(targetDate.getDate() + offset);
    const dayName = reverseDayMap[targetDate.getDay()];
    return { dayName, targetDate: targetDate };
  } else {
    return { dayName: null, targetDate: currentDate };
  }
}
