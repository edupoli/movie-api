import * as express from "express";
import { Request, Response } from "express";
import { query } from "./db";
import { classifyIntent } from "./nlpOpenAI";
import { findMovieIdByName } from "./fuzzyMatch";
import * as dotenv from "dotenv";
dotenv.config();
import {
  getMoviesInTheaters,
  getShowtimesToday,
  getShowtimesSpecificDay,
  getUpcomingMovies,
  getMovieDetails,
} from "./queries";

const app = express();
app.use(express.json());

interface SearchPayload {
  mensagem: string;
  tipo_necessidade: "lista" | "detalhes";
  cinema: string;
  filme: string;
}

interface QueryParams {
  cinemaId: number;
  movieId: number | null;
  currentDate: Date;
  targetDate?: Date;
  status: string;
  tipo_necessidade: "lista" | "detalhes";
}

// Helper function to format date as dd/mm/yyyy
function formatDate(date: Date | null): string {
  if (!date) return "N/A";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

app.post("/search", async (req: Request, res: Response): Promise<any> => {
  try {
    const { mensagem, tipo_necessidade, cinema, filme }: SearchPayload =
      req.body;

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

    // Handle movie if provided
    let movieId: number | null = null;
    let movieName: string = "";
    if (filme) {
      const movie = await findMovieIdByName(filme);
      if (!movie) {
        return res.json([
          {
            output: `Não achei nada sobre esse filme. Dá uma olhada na programação do site, vai que, né? Não me julgue. Às vezes me confundo, sou uma IA ainda em treinamento 😉 Link: ${urlConferirHorarios}`,
          },
        ]);
      }
      movieId = movie.id;
      movieName = movie.name;
    }

    // Classify intent
    const {
      intent,
      time,
      movie: movieFromQuery,
      status,
    } = await classifyIntent(mensagem);
    const currentDate = new Date();

    // Handle time reference
    let targetDate: Date | undefined;
    const dayMap: { [key: string]: string } = {
      monday: "segunda",
      tuesday: "terca",
      wednesday: "quarta",
      thursday: "quinta",
      friday: "sexta",
      saturday: "sabado",
      sunday: "domingo",
    };
    if (time === "tomorrow") {
      targetDate = new Date(currentDate);
      targetDate.setDate(currentDate.getDate() + 1);
    } else if (time && dayMap[time]) {
      const daysOfWeek = [
        "domingo",
        "segunda",
        "terca",
        "quarta",
        "quinta",
        "sexta",
        "sabado",
      ];
      const targetDay = dayMap[time];
      const targetDayIndex = daysOfWeek.indexOf(targetDay);
      const currentDayIndex = currentDate.getDay();
      const daysUntilTarget = (targetDayIndex - currentDayIndex + 7) % 7 || 7;
      targetDate = new Date(currentDate);
      targetDate.setDate(currentDate.getDate() + daysUntilTarget);
    } else if (time === "next_week") {
      targetDate = new Date(currentDate);
      targetDate.setDate(currentDate.getDate() + 7);
    }

    // Query parameters
    const queryParams: QueryParams = {
      cinemaId,
      movieId,
      currentDate,
      targetDate,
      status: status || "em cartaz",
      tipo_necessidade,
    };

    // Execute query based on intent
    let results: any[] = [];
    switch (intent) {
      case "movies_in_theaters":
        results = await getMoviesInTheaters(queryParams);
        break;
      case "movie_showtimes_today":
        results = await getShowtimesToday(queryParams);
        break;
      case "movie_showtimes_specific_day":
        if (!targetDate)
          throw new Error("Target date required for specific day showtimes");
        results = await getShowtimesSpecificDay({ ...queryParams, targetDate });
        break;
      case "upcoming_movies":
        results = await getUpcomingMovies(queryParams);
        break;
      case "movie_details":
        if (!movieId && movieFromQuery) {
          const movie = await findMovieIdByName(movieFromQuery);
          if (movie) {
            movieId = movie.id;
            movieName = movie.name;
            queryParams.movieId = movieId;
          }
        }
        if (!movieId) {
          return res.json([
            {
              output: `Não achei nada sobre esse filme. Dá uma olhada na programação do site, vai que, né? Não me julgue. Às vezes me confundo, sou uma IA ainda em treinamento 😉 Link: ${urlConferirHorarios}`,
            },
          ]);
        }
        results = await getMovieDetails(queryParams);
        break;
      default:
        return res.json([
          {
            output: `Não entendi sua pergunta. Dá uma olhada na programação do site, vai que, né? Não me julgue. Às vezes me confundo, sou uma IA ainda em treinamento 😉 Link: ${urlConferirHorarios}`,
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
          }. Dá uma olhada na programação do site, vai que, né? Não me julgue. Às vezes me confundo, sou uma IA ainda em treinamento 😉 Link: ${urlConferirHorarios}`,
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
          const date = r[day + "_date"];
          return `${day} ${r[day]}`;
        });
    } else if (tipo_necessidade === "lista") {
      output = results.map((r: any) => r.nome);
    } else {
      output = results.map(
        (r: any) =>
          `Nome: ${r.nome}\nSinopse: ${r.sinopse || "N/A"}\nDuração: ${
            r.duracao || "N/A"
          } horas\nClassificação: ${r.classificacao || "N/A"}\nGênero: ${
            r.genero || "N/A"
          }\nDiretor: ${r.diretor || "N/A"}\nElenco: ${
            r.elenco_principal || "N/A"
          }\nEstreia: ${formatDate(r.data_estreia)}`
      );
    }

    res.json([{ output: output.join("\n") }]);
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
