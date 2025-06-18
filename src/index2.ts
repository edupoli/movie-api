import * as express from "express";
import { Request, Response } from "express";
import { query } from "./db";
import { classifyIntent } from "./nlpOpenAI";
import { findMovieIdByName } from "./fuzzyMatch";
import { getDayDate } from "./utils/getdaydate";
import * as dotenv from "dotenv";
dotenv.config();
import {
  getMoviesInTheaters,
  getShowtimesToday,
  getShowtimesSpecificDay,
  getUpcomingMovies,
  getMovieDetails,
  getMoviesWithShowtimes,
  getMovieShowtimesAllDays,
} from "./queries";

const app = express();
app.use(express.json());

interface SearchPayload {
  mensagem: string;
  cinema: string;
}

interface QueryParams {
  cinemaId: number;
  movieId: number | null;
  currentDate: Date;
  targetDate?: Date;
  status?: string;
  timeFilter?: { before?: string; after?: string };
}

// Helper function to format date as dd/mm/yyyy
function formatDate(date: Date | null): string {
  if (!date) return "N/A";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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
      return res.status(400).json([{ output: "Cinema não encontrado." }]);
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
    console.log(
      "Intent:",
      intent,
      "Time:",
      time,
      "Movie:",
      movieFromQuery,
      "Status:",
      status
    );
    const currentDate = new Date();

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

    const timeSearch = getDayDate(time);
    console.log("Time Search:", timeSearch);

    // Query parameters
    const queryParams: QueryParams = {
      cinemaId,
      movieId,
      currentDate,
      targetDate,
      status: status || "em cartaz",
    };

    // Execute query based on intent
    let results: any[] = [];
    switch (intent) {
      case "movies_in_theaters":
        results = movieId
          ? await getMovieShowtimesAllDays(queryParams)
          : await getMoviesWithShowtimes(queryParams);
        break;
      case "movie_showtimes_today":
        results = await getShowtimesToday(queryParams);
        break;
      case "movie_showtimes_specific_day":
        if (!targetDate)
          throw new Error("Target date required for specific day showtimes");
        results = await getShowtimesSpecificDay({ ...queryParams, targetDate });
        break;
      case "movie_showtimes_all_days":
        if (!movieId) {
          return res.json([
            {
              output: `Por favor, especifique um filme. Dá uma olhada na programação do site: ${urlConferirHorarios}`,
            },
          ]);
        }
        results = await getMovieShowtimesAllDays(queryParams);
        break;
      case "upcoming_movies":
        results = await getUpcomingMovies(queryParams);
        break;
      case "movie_details":
        if (!movieId) {
          return res.json([
            {
              output: `Por favor, especifique um filme. Dá uma olhada na programação do site: ${urlConferirHorarios}`,
            },
          ]);
        }
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
    // Format output
    let output: string[] = [];
    if (!results.length) {
      return res.json([
        {
          output: `Não achei nada sobre ${
            movieName || "filmes"
          }. Dá uma olhada na programação do site: ${urlConferirHorarios}`,
        },
      ]);
    }

    if (intent.includes("showtimes")) {
      output = results
        .filter((r: any) => {
          const day = Object.keys(r).find((k) =>
            [
              "segunda",
              "terca",
              "quarta",
              "quinta",
              "sexta",
              "sabado",
              "domingo",
            ].includes(k)
          );
          return day && r[day];
        })
        .map((r: any) => {
          const day = Object.keys(r).find((k) =>
            [
              "segunda",
              "terca",
              "quarta",
              "quinta",
              "sexta",
              "sabado",
              "domingo",
            ].includes(k)
          );
          return `Filme: ${r.nome} - Horários: ${day} ${r[day]}`;
        });
    } else if (
      intent === "movie_showtimes_all_days" ||
      intent === "movies_in_theaters"
    ) {
      output = results
        .filter((r: any) => {
          return Object.keys(r).some((k) =>
            [
              "segunda",
              "terca",
              "quarta",
              "quinta",
              "sexta",
              "sabado",
              "domingo",
            ].includes(k)
          );
        })
        .map((r: any) => {
          const showtimes: string[] = [];
          [
            "sabado",
            "domingo",
            "segunda",
            "terca",
            "quarta",
            "quinta",
            "sexta",
          ].forEach((day) => {
            if (r[day]) {
              showtimes.push(`${day} ${r[day]}`);
            }
          });
          return `Filme: ${r.nome} - Horários:\n${showtimes.join("\n")}`;
        });
    } else if (intent === "upcoming_movies") {
      output = results.map(
        (r: any) =>
          `Filme: ${r.nome} - Estreia: ${formatDate(r.data_estreia) || "N/A"}`
      );
    } else if (intent === "movie_details") {
      output = results.map(
        (r: any) =>
          `Filme: ${r.nome}\nSinopse: ${r.sinopse || "N/A"}\nDuração: ${
            r.duracao || "N/A"
          } horas\nClassificação: ${r.classificacao || "N/A"}\nGênero: ${
            r.genero || "N/A"
          }\nDiretor: ${r.diretor || "N/A"}\nElenco: ${
            r.elenco_principal || "N/A"
          }\nEstreia: ${formatDate(r.data_estreia)}`
      );
    }

    // Handle ticket price queries
    if (mensagem.toLowerCase().includes("valores dos ingressos")) {
      output.push(
        `Para informações sobre valores de ingressos, consulte o site do cinema: ${urlConferirHorarios}`
      );
    }

    res.json([{ output: output.join("\n\n") }]);
  } catch (error) {
    console.error("Error in /search endpoint:", error);
    res
      .status(500)
      .json([
        { output: "Erro interno no servidor. Tente novamente mais tarde." },
      ]);
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
