import * as express from "express";
import { Request, Response } from "express";
import { query } from "./db";
import { classifyIntent } from "./nlpOpenAI";
import { findMovieIdByName } from "./fuzzyMatch";
import { getDayDate } from "./utils/getdaydate";
import { getMovieDetails, getMovieShowtimes } from "./query-estudo";
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
  if (!date) return "N/A";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function extractDateFromDayString(dayString: string): Date | null {
  if (!dayString) return null;

  // Extrai a primeira data encontrada no formato DD/MM/YYYY
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
  today.setHours(0, 0, 0, 0); // Remove a parte de horas para comparar apenas datas
  let output = "";

  results.forEach((movie, index) => {
    // Fixed fields to display first
    const fixedFields = {
      nome: movie.nome,
      status: movie.status,
      semana_inicio: formatDate(movie.semana_inicio),
      semana_fim: formatDate(movie.semana_fim),
    };

    // Extract and sort day fields by date
    const dayEntries: { dayName: string; date: Date | null; value: string }[] =
      daysWeek
        .map((dayName) => ({
          dayName,
          date: extractDateFromDayString(movie[dayName] || ""),
          value: movie[dayName] || "",
        }))
        .filter((entry) => entry.value && entry.date && entry.date >= today) // Exclude empty or past dates
        .sort((a, b) => {
          if (!a.date || !b.date) return 0;
          return a.date.getTime() - b.date.getTime();
        });

    // Output fixed fields
    Object.entries(fixedFields).forEach(([key, value]) => {
      output += `${key} ${value}\n`;
    });

    // Output sorted day fields
    dayEntries.forEach((entry) => {
      output += `${entry.dayName} ${entry.value}\n`;
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
      default:
        return res.json([
          {
            output: `Não entendi sua pergunta. Dá uma olhada na programação do site: ${urlConferirHorarios}`,
          },
        ]);
    }

    console.log("Results:", results);
    if (!results.length) {
      return res.json([
        {
          output: `Não achei nada sobre o filme "${movieName}". Dá uma olhada na programação do site: ${urlConferirHorarios}`,
        },
      ]);
    }
    const formattedResults = formatMovieData(results);
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

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});
