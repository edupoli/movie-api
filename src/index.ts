import * as express from "express";
import { Request, Response } from "express";
import { query } from "./db";
import { classifyIntent } from "./nlpOpenAI";
import { findMovieIdByName } from "./fuzzyMatch";
import { getDayDate } from "./utils/getdaydate";
import { getMovieDetails, getMovieShowtimes, getTicketPrices } from "./queries";
import * as dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

interface SearchPayload {
  mensagem: string;
  cinema: string;
}

interface QueryParams {
  cinemaId: number;
  movieId?: number | null;
  dayName?: string;
  targetDate?: Date;
  status?: string;
}

function formatDate(date: Date | null): string {
  if (!date) return null;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function extractDateFromDayString(dayString: string): Date | null {
  if (!dayString) return null;
  const dateMatch = dayString.match(/\d{2}\/\d{2}\/\d{4}/);
  if (!dateMatch) return null;
  const [day, month, year] = dateMatch[0].split("/").map(Number);
  return new Date(year, month - 1, day);
}

function formatMovieData(results: any[]): { output: string }[] {
  const daysWeek = [
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
    "domingo",
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let output = "";

  // Ordenar por semana_inicio (mais antiga primeiro)
  const sortedResults = [...results].sort((a, b) => {
    const dateA = a.semana_inicio ? new Date(a.semana_inicio).getTime() : 0;
    const dateB = b.semana_inicio ? new Date(b.semana_inicio).getTime() : 0;
    return dateA - dateB;
  });

  sortedResults.forEach((movie, index) => {
    const fixedFields = {
      nome: movie.nome,
      status: movie.status,
      semana_inicio: formatDate(movie.semana_inicio),
      semana_fim: formatDate(movie.semana_fim),
      data_estreia: formatDate(movie.data_estreia),
    };

    // Mapear todos os dias da semana
    const programacaoDias = daysWeek.map((dayName) => ({
      dayName,
      value: movie[dayName] || "",
    }));

    // Adiciona campos fixos
    Object.entries(fixedFields).forEach(([key, value]) => {
      if (value) output += `${key} ${value}\n`;
    });

    // Adiciona apenas dias com programação definida
    programacaoDias.forEach((entry) => {
      output += `${entry.dayName} ${entry.value}\n`;
    });

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

    // Handle movie if provided
    let movieId: number | null = null;
    let movieName: string = "";
    if (movieFromQuery) {
      const movie = await findMovieIdByName(movieFromQuery);
      if (!movie) {
        return res.json([
          {
            output: `Não achei nada sobre o filme "${movieFromQuery}". Dá uma olhada na programação do site: ${urlConferirHorarios}`,
          },
        ]);
      }
      movieId = movie.id;
      movieName = movie.name;
    }

    const { targetDate, dayName } = getDayDate(time);
    console.log("Target Date:", targetDate, "Day Name:", dayName);
    // Query parameters
    const queryParams: QueryParams = {
      cinemaId,
      movieId,
      dayName,
      targetDate,
      status: status,
    };
    console.log("Query Params:", queryParams);
    let results: any[] = [];
    switch (intent) {
      case "movie_showtimes":
        results = await getMovieShowtimes(queryParams);
        break;
      case "movie_details":
        results = await getMovieDetails(queryParams);
        break;
      case "ticket_prices":
        results = await getTicketPrices(queryParams);
        break;
      default:
        return res.json([
          {
            output: `Não entendi sua pergunta. Dá uma olhada na programação do site: ${urlConferirHorarios}`,
          },
        ]);
    }

    console.log("Results:", results); // Debug log to inspect data
    if (!results.length) {
      return res.json([
        {
          output: `Não achei nada sobre ${
            movieName ? `o filme "${movieName}"` : "essa solicitação"
          }. Dá uma olhada na programação do site: ${urlConferirHorarios}`,
        },
      ]);
    }
    const formattedResults =
      intent === "ticket_prices"
        ? formatTicketPrices(results)
        : formatMovieData(results);
    return res.json(formattedResults);
  } catch (error) {
    console.error("Error:", error);
    res
      .status(500)
      .json([{ output: "Ocorreu um erro ao processar a consulta." }]);
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
