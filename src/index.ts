import * as express from "express";
import { Request, Response } from "express";
import { query } from "./db";
import { classifyIntent } from "./nlpOpenAI";
import { findMovieIdByName } from "./fuzzyMatch";
import { getDayDate } from "./utils/getdaydate";
import { getMovieShowtimes } from "./query-estudo";
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

    // Query parameters
    const queryParams: QueryParams = {
      cinemaId,
      movieId,
      dayName,
      targetDate,
      status: status || "em cartaz",
    };

    const results = await getMovieShowtimes(queryParams);
    console.log("Results:", results);
    return res.json(results);
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
