import express from "express";
import { Request, Response } from "express";
import { query } from "./db";
import { classifyIntent } from "./nlpOpenAI";
import { findMovieIdByName } from "./fuzzyMatch";
import { getDayDate } from "./utils/getdaydate";
import { toZoned, formatBR } from "./utils/date";
import {
  getMovieDetails,
  getMovieShowtimes,
  getTicketPrices,
  getCinemaInfo,
} from "./queries";
import * as dotenv from "dotenv";
dotenv.config();
import { syncVelox } from "./utils/velox-api";
import { syncVendaBem } from "./utils/venda-bem-api";

const app = express();
app.use(express.json());

interface SearchPayload {
  mensagem: string;
  cinema: string;
}

interface QueryParams {
  cinemaId: number;
  movieId?: number | null;
  dayName?: string | string[] | null;
  targetDate?: Date | Date[] | null;
  status?: string | null;
}

function formatDate(date: Date | null): string {
  if (!date) return null;
  return formatBR(date);
}

function extractDateFromDayString(dayString: string): Date | null {
  if (!dayString) return null;
  const dateMatch = dayString.match(/\d{2}\/\d{2}\/\d{4}/);
  if (!dateMatch) return null;
  const [day, month, year] = dateMatch[0].split("/").map(Number);
  return new Date(year, month - 1, day);
}

function formatMovieData(
  results: any[],
  intent?: string
): { output: string }[] {
  const daysWeek = [
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
    "domingo",
  ];
  const today = toZoned(new Date());
  today.setHours(0, 0, 0, 0);
  let output = "";

  // ADIÇÃO: Ordenar os resultados por semana_inicio (mais antiga primeiro)
  const sortedResults = [...results].sort((a, b) => {
    const dateA = a.semana_inicio ? new Date(a.semana_inicio).getTime() : 0;
    const dateB = b.semana_inicio ? new Date(b.semana_inicio).getTime() : 0;
    return dateA - dateB;
  });

  // Alterado para usar sortedResults em vez de results
  sortedResults.forEach((movie, index) => {
    // Verifica se é movie_showtimes e status "em breve"
    if (intent === "movie_showtimes" && movie.status === "em breve") {
      // Retorna apenas nome, status e data_estreia
      const simplifiedFields = {
        nome: movie.nome,
        status: movie.status,
        data_estreia: formatDate(movie.data_estreia),
      };

      Object.entries(simplifiedFields).forEach(([key, value]) => {
        if (value) output += `${key} ${value}\n`;
      });
    } else {
      // Lógica original para outros casos
      const hasScheduleData = daysWeek.some((day) => movie[day]);

      if (hasScheduleData) {
        const fixedFields = {
          nome: movie.nome,
          status: movie.status,
          semana_inicio: formatDate(movie.semana_inicio),
          semana_fim: formatDate(movie.semana_fim),
          data_estreia: formatDate(movie.data_estreia),
        };

        const dayEntries = daysWeek
          .map((dayName) => ({
            dayName,
            date: extractDateFromDayString(movie[dayName] || ""),
            value: movie[dayName] || "",
          }))
          .filter((entry) => entry.value && entry.date && entry.date >= today)
          .sort((a, b) => {
            if (!a.date || !b.date) return 0;
            return a.date.getTime() - b.date.getTime();
          });

        Object.entries(fixedFields).forEach(([key, value]) => {
          if (value) output += `${key} ${value}\n`;
        });

        dayEntries.forEach((entry) => {
          output += `${entry.dayName} ${entry.value}\n`;
        });
      } else {
        Object.entries(movie).forEach(([key, value]) => {
          if (
            key === "semana_inicio" ||
            key === "semana_fim" ||
            key === "data_estreia"
          ) {
            value = formatDate(value as Date);
          }
          output += `${key}: ${value}\n`;
        });
      }
    }

    if (index < sortedResults.length - 1) {
      output += "\n\n";
    }
  });

  return [{ output: output.trim() }];
}

function formatTicketPrices(results: any[]): { output: string }[] {
  const daysWeek = [
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
    "domingo",
  ];
  let output = "";

  results.forEach((ticket, index) => {
    const priceFields = [
      "inteira_2d",
      "meia_2d",
      "inteira_2d_desconto",
      "inteira_3d",
      "meia_3d",
      "inteira_3d_desconto",
      "inteira_vip_2d",
      "meia_vip_2d",
      "inteira_vip_2d_desconto",
      "inteira_vip_3d",
      "meia_vip_3d",
      "inteira_vip_3d_desconto",
    ];

    // Add fixed fields
    const fixedFields = { nome: ticket.nome, observacoes: ticket.observacoes };
    Object.entries(fixedFields).forEach(([key, value]) => {
      if (value) output += `${key}: ${value}\n`;
    });

    // Add price fields with string-to-number conversion
    priceFields.forEach((key) => {
      if (ticket[key] !== null && ticket[key] !== undefined) {
        const value = parseFloat(ticket[key]);
        if (!isNaN(value)) {
          output += `${key}: R$${value.toFixed(2)}\n`;
        }
      }
    });

    // Add day-specific fields with string-to-number conversion
    daysWeek.forEach((day) => {
      if (ticket[day] !== null && ticket[day] !== undefined) {
        const value = parseFloat(ticket[day]);
        if (!isNaN(value)) {
          output += `${day}: R$${value.toFixed(2)}\n`;
        }
      }
    });

    if (index < results.length - 1) {
      output += "\n\n";
    }
  });

  return [{ output: output.trim() }];
}

app.post("/search", async (req: Request, res: Response): Promise<any> => {
  try {
    const { mensagem, cinema }: SearchPayload = req.body;

    // Validate cinema
    const cinemaData = await query(
      "SELECT id, url_conferir_horarios FROM cinemas WHERE nome = $1",
      [cinema]
    );
    if (!cinemaData.length) {
      return res.status(400).json([
        {
          output:
            "Não entendi de qual cinema da nossa rede você está procurando, pode me dizer por favor?”",
        },
      ]);
    }
    const cinemaId = cinemaData[0].id;
    const urlConferirHorarios = cinemaData[0].url_conferir_horarios;

    // Classify intent
    const {
      intent,
      time,
      movie: movieFromQuery,
      status,
    } = await classifyIntent(mensagem);
    console.log({
      Intent: intent,
      Time: time,
      Movie: movieFromQuery,
      Status: status,
    });

    // Se a intenção envolve filme, buscar todos os matches
    let movies: Array<{ id: number; name: string }> = [];
    if (movieFromQuery) {
      const foundMovies = await findMovieIdByName(movieFromQuery, cinemaId);
      console.log("Matched Movies:", foundMovies);
      if (!foundMovies || foundMovies.length === 0) {
        return res.json([
          {
            output: `Não achei nada sobre o filme "${movieFromQuery}". Dá uma olhada na programação do site: ${urlConferirHorarios}`,
          },
        ]);
      }
      movies = foundMovies;
    }

    // Processa os dias solicitados
    const { targetDate, dayName } = getDayDate(time);

    // Se for array de dias, garante que dayName seja array
    const processedDayName = Array.isArray(dayName)
      ? dayName
      : dayName
      ? [dayName]
      : null;
    const processedTargetDate = Array.isArray(targetDate)
      ? targetDate
      : targetDate
      ? [targetDate]
      : null;

    console.log("Target Date:", targetDate, "Day Name:", dayName);

    let allResults: any[] = [];
    let movieNames: string[] = [];

    if (intent === "movie_showtimes" || intent === "movie_details") {
      // Para cada filme encontrado, buscar os dados e agregar
      if (movies.length > 0) {
        for (const movie of movies) {
          const queryParams: QueryParams = {
            cinemaId,
            movieId: movie.id,
            dayName: processedDayName,
            targetDate: processedTargetDate,
            status: status,
          };
          let results: any[] = [];
          if (intent === "movie_showtimes") {
            results = await getMovieShowtimes(queryParams);
          } else {
            results = await getMovieDetails(queryParams);
          }
          if (results.length > 0) {
            allResults = allResults.concat(results);
            movieNames.push(movie.name);
          }
        }
      } else {
        // Se não há filme, busca geral
        const queryParams: QueryParams = {
          cinemaId,
          movieId: null,
          dayName: processedDayName,
          targetDate: processedTargetDate,
          status: status,
        };
        if (intent === "movie_showtimes") {
          allResults = await getMovieShowtimes(queryParams);
        } else {
          allResults = await getMovieDetails(queryParams);
        }
      }
    } else if (intent === "ticket_prices") {
      const queryParams: QueryParams = {
        cinemaId,
        movieId: movies.length === 1 ? movies[0].id : null,
        dayName,
        targetDate,
        status: status,
      };
      allResults = await getTicketPrices(queryParams);
      if (movies.length === 1) movieNames.push(movies[0].name);
    } else if (intent === "cinema_info") {
      const queryParams: QueryParams = {
        cinemaId,
      };
      allResults = await getCinemaInfo(queryParams);
    }

    console.log("Results:", allResults); // Debug log to inspect data
    if (!allResults.length) {
      return res.json([
        {
          output: `Não achei nada sobre ${
            movieNames.length > 0
              ? `os filmes "${movieNames.join(", ")}"`
              : movieFromQuery
              ? `o filme "${movieFromQuery}"`
              : "essa solicitação"
          }. Dá uma olhada na programação do site: ${urlConferirHorarios}`,
        },
      ]);
    }

    const formattedResults =
      intent === "ticket_prices"
        ? formatTicketPrices(allResults)
        : intent === "cinema_info"
        ? allResults.map((cinema) => ({
            output: `Informações do cinema:\nNome: ${cinema?.nome}\nEndereço: ${
              cinema?.endereco || "Não cadastrado"
            }\nTelefone: ${cinema?.telefone || "Não cadastrado"}\nSite: ${
              cinema.url_conferir_horarios || "-"
            }\nComprar ingresso: ${cinema.url_comprar_ingresso || "-"}`,
          }))
        : formatMovieData(allResults, intent);
    return res.json(formattedResults);
  } catch (error) {
    console.error("Error:", error);
    res
      .status(500)
      .json([{ output: "Ocorreu um erro ao processar a consulta." }]);
  }
});

// ENDPOINTS DE SINCRONIZAÇÃO
// Rota: /sync/velox -> Executa syncVelox e retorna resumo
app.get("/sync/velox", async (req, res) => {
  try {
    await syncVelox();

    res.json({
      message: "Sincronização Velox concluída",
    });
  } catch (error) {
    console.error("Erro ao executar syncVelox:", error);
    res.status(500).json({ error: "Erro durante sincronização Velox" });
  }
});

// Rota: /sync/multicine -> Executa syncVendaBem (main) e retorna resumo por cinema
app.get("/sync/multicine", async (req, res) => {
  try {
    await syncVendaBem();

    res.json({
      message: "Sincronização Multicine/VendaBem concluída",
    });
  } catch (error) {
    console.error("Erro ao executar syncVendaBem:", error);
    res
      .status(500)
      .json({ error: "Erro durante sincronização Multicine/VendaBem" });
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

app.listen(process.env.PORT || 8000, () => {
  console.log(`Server running on port ${process.env.PORT || 8000}`);
});
