// import * as express from "express";
// import { Request, Response, NextFunction } from "express";
// import * as multer from "multer";
// import { read, WorkBook, WorkSheet } from "xlsx";
// import { QdrantClient } from "@qdrant/js-client-rest";
// import OpenAI from "openai";
// import { v4 as uuidv4 } from "uuid";
// import * as dotenv from "dotenv";

// // Load environment variables
// dotenv.config();

// // Initialize Express app and multer for file uploads
// const app = express();
// const upload = multer({ storage: multer.memoryStorage() });
// app.use(express.json());

// // Initialize OpenAI client
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// // Initialize Qdrant client
// const qdrant = new QdrantClient({ url: "http://localhost:6333" });
// const COLLECTION_NAME = "movies";

// // Interfaces for data structure
// interface Movie {
//   id: number;
//   nome: string;
//   sinopse: string;
//   duracao: number;
//   classificacao: string;
//   genero: string;
//   diretor: string;
//   elenco_principal: string;
//   data_estreia: string;
//   url_poster: string;
//   url_trailer: string;
// }

// interface Cinema {
//   id: number;
//   nome: string;
//   endereco: string;
//   url_conferir_horarios: string;
//   url_comprar_ingresso: string;
// }

// interface Programacao {
//   id_filme: number;
//   id_cinema: number;
//   status: string;
//   semana_inicio: string;
//   semana_fim: string;
//   segunda: string;
//   terca: string;
//   quarta: string;
//   quinta: string;
//   sexta: string;
//   sabado: string;
//   domingo: string;
// }

// // Initialize Qdrant collection
// async function initializeCollection() {
//   try {
//     await qdrant.createCollection(COLLECTION_NAME, {
//       vectors: {
//         size: 1536, // Dimension of OpenAI's text-embedding-3-small
//         distance: "Cosine",
//       },
//     });
//     console.log("Collection created");
//   } catch (error) {
//     console.error("Error creating collection:", error);
//   }
// }

// // Function to generate OpenAI embeddings
// async function getEmbedding(text: string): Promise<number[]> {
//   try {
//     const response = await openai.embeddings.create({
//       model: "text-embedding-3-small",
//       input: text,
//     });
//     return response.data[0].embedding;
//   } catch (error) {
//     console.error("Error generating embedding:", error);
//     throw new Error("Failed to generate embedding");
//   }
// }

// // Process Excel file and insert into Qdrant
// app.post(
//   "/upload-excel",
//   upload.single("file"),
//   async (req: Request, res: Response, next: NextFunction): Promise<any> => {
//     try {
//       if (!req.file) {
//         return res.status(400).json({ error: "No file uploaded" });
//       }

//       // Parse Excel file
//       const workbook: WorkBook = read(req.file.buffer, { type: "buffer" });
//       const moviesSheet: WorkSheet = workbook.Sheets["Filmes"];
//       const programacaoSheet: WorkSheet = workbook.Sheets["Programação"];
//       const cinemasSheet: WorkSheet = workbook.Sheets["Cinema"];

//       // Convert sheets to JSON
//       const movies: Movie[] = require("xlsx").utils.sheet_to_json(moviesSheet);
//       const programacao: Programacao[] =
//         require("xlsx").utils.sheet_to_json(programacaoSheet);
//       const cinemas: Cinema[] =
//         require("xlsx").utils.sheet_to_json(cinemasSheet);

//       // Initialize Qdrant collection if not exists
//       await initializeCollection();

//       // Combine data for Qdrant
//       const points = await Promise.all(
//         movies.map(async (movie) => {
//           const schedules = programacao.filter((p) => p.id_filme === movie.id);
//           const cinemaIds = [...new Set(schedules.map((s) => s.id_cinema))];
//           const cinemasInfo = cinemaIds
//             .map((cid) => cinemas.find((c) => c.id === cid))
//             .filter((c): c is Cinema => !!c);

//           // Combine relevant text for embedding
//           const textToEmbed = `${movie.nome} ${movie.sinopse} ${movie.genero} ${movie.diretor} ${movie.elenco_principal}`;

//           // Generate embedding
//           const vector = await getEmbedding(textToEmbed);

//           return {
//             id: uuidv4(),
//             vector,
//             payload: {
//               movie_id: movie.id,
//               nome: movie.nome,
//               sinopse: movie.sinopse,
//               duracao: movie.duracao || null,
//               classificacao: movie.classificacao || null,
//               genero: movie.genero,
//               diretor: movie.diretor,
//               elenco_principal: movie.elenco_principal,
//               data_estreia: movie.data_estreia,
//               url_poster: movie.url_poster,
//               url_trailer: movie.url_trailer,
//               schedules: schedules.map((s) => ({
//                 cinema_id: s.id_cinema,
//                 status: s.status,
//                 semana_inicio: s.semana_inicio,
//                 semana_fim: s.semana_fim,
//                 horarios: {
//                   segunda: s.segunda,
//                   terca: s.terca,
//                   quarta: s.quarta,
//                   quinta: s.quinta,
//                   sexta: s.sexta,
//                   sabado: s.sabado,
//                   domingo: s.domingo,
//                 },
//                 cinema: cinemasInfo.find((c) => c.id === s.id_cinema) || null,
//               })),
//             },
//           };
//         })
//       );

//       // Upsert points to Qdrant
//       await qdrant.upsert(COLLECTION_NAME, { points });

//       res
//         .status(200)
//         .json({ message: "Excel data processed and inserted into Qdrant" });
//     } catch (error) {
//       console.error("Error processing Excel:", error);
//       res.status(500).json({ error: "Failed to process Excel file" });
//       next(error);
//     }
//   }
// );

// // Query endpoint for similarity search
// app.post("/query", async (req: Request, res: Response): Promise<any> => {
//   try {
//     const { query } = req.body;
//     if (!query || typeof query !== "string") {
//       return res.status(400).json({ error: "Query string is required" });
//     }

//     // Generate embedding for the query
//     const queryVector = await getEmbedding(query);

//     // Perform similarity search
//     const searchResults = await qdrant.search(COLLECTION_NAME, {
//       vector: queryVector,
//       limit: 10,
//       filter: {
//         must: [
//           {
//             key: "schedules.status",
//             match: { value: "Em Cartaz" }, // Filter for movies currently in theaters
//           },
//         ],
//       },
//     });

//     // Process results
//     const results = searchResults.map((result) => ({
//       movie_id: result.payload.movie_id,
//       nome: result.payload.nome,
//       sinopse: result.payload.sinopse,
//       duracao: result.payload.duracao,
//       classificacao: result.payload.classificacao,
//       genero: result.payload.genero,
//       diretor: result.payload.diretor,
//       elenco_principal: result.payload.elenco_principal,
//       data_estreia: result.payload.data_estreia,
//       url_poster: result.payload.url_poster,
//       url_trailer: result.payload.url_trailer,
//       schedules: result.payload.schedules,
//       score: result.score,
//     }));

//     res.status(200).json({ results });
//   } catch (error) {
//     console.error("Error querying Qdrant:", error);
//     res.status(500).json({ error: "Failed to process query" });
//   }
// });

// // Start the server
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

import * as express from "express";
import { Request, Response } from "express";
import * as multer from "multer";
import { read, WorkBook, WorkSheet } from "xlsx";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize Express app and multer for file uploads
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Qdrant client
const qdrant = new QdrantClient({ url: "http://localhost:6333" });
const MOVIES_COLLECTION = "movies";
const CINEMAS_COLLECTION = "cinemas";
const SCHEDULES_COLLECTION = "schedules";

// Interfaces for data structure
interface Movie {
  id: number;
  nome: string;
  sinopse: string;
  duracao: number | null;
  classificacao: string;
  genero: string;
  diretor: string;
  elemento_principal: string;
  data_estreia: string;
  url_poster: string;
  url_trailer: string;
}

interface Cinema {
  id: number;
  nome: string;
  endereco: string;
  url_conferir_horarios: string;
  url_comprar_ingresso: string;
}

interface Schedule {
  id_filme: number;
  id_cinema: number;
  status: string;
  semana_inicio: string;
  semana_fim: string;
  segunda: string;
  terca: string;
  quarta: string;
  quinta: string;
  sexta: string;
  sabado: string;
  domingo: string;
}

// Check if collection exists
async function collectionExists(collectionName: string): Promise<boolean> {
  try {
    await qdrant.getCollection(collectionName);
    return true;
  } catch (error) {
    return false;
  }
}

// Initialize Qdrant collections
async function initializeCollections() {
  try {
    // Movies collection with vectors
    if (!(await collectionExists(MOVIES_COLLECTION))) {
      await qdrant.createCollection(MOVIES_COLLECTION, {
        vectors: {
          size: 1536, // Dimension of OpenAI's text-embedding-3-small
          distance: "Cosine",
        },
      });
      console.log("Movies collection created");
    }

    // Cinemas collection with vectors
    if (!(await collectionExists(CINEMAS_COLLECTION))) {
      await qdrant.createCollection(CINEMAS_COLLECTION, {
        vectors: {
          size: 1536,
          distance: "Cosine",
        },
      });
      console.log("Cinemas collection created");
    }

    // Schedules collection without vectors
    if (!(await collectionExists(SCHEDULES_COLLECTION))) {
      await qdrant.createCollection(SCHEDULES_COLLECTION, {});
      console.log("Schedules collection created");
    }
  } catch (error) {
    console.error("Error creating collections:", error);
    throw error;
  }
}

// Function to generate OpenAI embeddings
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw new Error("Failed to generate embedding");
  }
}

// Process Excel file and insert into Qdrant
app.post(
  "/upload-excel",
  upload.single("file"),
  async (req: Request, res: Response): Promise<any> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Parse Excel file
      const workbook: WorkBook = read(req.file.buffer, { type: "buffer" });
      const moviesSheet: WorkSheet = workbook.Sheets["Filmes"];
      const programacaoSheet: WorkSheet = workbook.Sheets["Programação"];
      const cinemasSheet: WorkSheet = workbook.Sheets["Cinema"];

      // Convert sheets to JSON
      const movies: Movie[] = require("xlsx").utils.sheet_to_json(moviesSheet);
      const schedules: Schedule[] =
        require("xlsx").utils.sheet_to_json(programacaoSheet);
      const cinemas: Cinema[] =
        require("xlsx").utils.sheet_to_json(cinemasSheet);

      // Initialize Qdrant collections
      await initializeCollections();

      // Insert movies with embeddings
      const moviePoints = await Promise.all(
        movies.map(async (movie) => {
          const textToEmbed = `${movie.nome} ${movie.sinopse} ${movie.genero} ${
            movie.diretor
          } ${movie.elemento_principal || ""}`;
          const vector = await getEmbedding(textToEmbed);
          return {
            id: movie.id, // Use numeric movie ID
            vector,
            payload: {
              id: movie.id,
              nome: movie.nome,
              sinopse: movie.sinopse,
              duracao: movie.duracao || null,
              classificacao: movie.classificacao || null,
              genero: movie.genero,
              diretor: movie.diretor,
              elemento_principal: movie.elemento_principal || null,
              data_estreia: movie.data_estreia,
              url_poster: movie.url_poster,
              url_trailer: movie.url_trailer,
            },
          };
        })
      );
      await qdrant.upsert(MOVIES_COLLECTION, { points: moviePoints });

      // Insert cinemas with embeddings
      const cinemaPoints = await Promise.all(
        cinemas.map(async (cinema) => {
          const textToEmbed = `${cinema.nome} ${cinema.endereco}`;
          const vector = await getEmbedding(textToEmbed);
          return {
            id: cinema.id, // Use numeric cinema ID
            vector,
            payload: {
              id: cinema.id,
              nome: cinema.nome,
              endereco: cinema.endereco,
              url_conferir_horarios: cinema.url_conferir_horarios,
              url_comprar_ingresso: cinema.url_comprar_ingresso,
            },
          };
        })
      );
      await qdrant.upsert(CINEMAS_COLLECTION, { points: cinemaPoints });

      // Insert schedules without vectors
      const schedulePoints = schedules.map((schedule) => ({
        id: uuidv4(), // Unique UUID for schedule entries
        vector: [], // Add empty vector field to satisfy type requirement
        payload: {
          id_filme: schedule.id_filme,
          id_cinema: schedule.id_cinema,
          status: schedule.status,
          semana_inicio: schedule.semana_inicio,
          semana_fim: schedule.semana_fim,
          horarios: {
            segunda: schedule.segunda || "",
            terca: schedule.terca || "",
            quarta: schedule.quarta || "",
            quinta: schedule.quinta || "",
            sexta: schedule.sexta || "",
            sabado: schedule.sabado || "",
            domingo: schedule.domingo || "",
          },
        },
      }));
      await qdrant.upsert(SCHEDULES_COLLECTION, { points: schedulePoints });

      res
        .status(200)
        .json({ message: "Excel data processed and inserted into Qdrant" });
    } catch (error) {
      console.error("Error processing Excel:", error);
      res.status(500).json({ error: "Failed to process Excel file" });
    }
  }
);

// Query endpoint for similarity search
app.post("/query", async (req: Request, res: Response): Promise<any> => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query string is required" });
    }

    // Generate embedding for the query
    const queryVector = await getEmbedding(query);

    // Search movies collection
    const movieResults = await qdrant.search(MOVIES_COLLECTION, {
      vector: queryVector,
      limit: 10,
      filter: {
        must: [
          {
            key: "data_estreia",
            range: {
              lte: "2025-05-28", // Movies released on or before today
            },
          },
        ],
      },
    });

    // Fetch schedules and filter for "Em Cartaz"
    const results = await Promise.all(
      movieResults.map(async (movieResult) => {
        const movie = movieResult.payload;
        // Fetch schedules for this movie
        const scheduleResults = await qdrant.scroll(SCHEDULES_COLLECTION, {
          filter: {
            must: [
              { key: "id_filme", match: { value: movie.id } },
              { key: "status", match: { value: "Em Cartaz" } },
            ],
          },
          limit: 100,
        });

        // Fetch cinema details for each schedule
        const schedulesWithCinemas = await Promise.all(
          scheduleResults.points.map(async (schedulePoint) => {
            const schedule = schedulePoint.payload;
            const cinemaResult = await qdrant.retrieve(CINEMAS_COLLECTION, {
              ids: [schedule.id_cinema as any],
            });
            const cinema = cinemaResult[0]?.payload || null;
            return {
              cinema_id: schedule.id_cinema,
              status: schedule.status,
              semana_inicio: schedule.semana_inicio,
              semana_fim: schedule.semana_fim,
              horarios: schedule.horarios,
              cinema,
            };
          })
        );

        return {
          movie_id: movie.id,
          nome: movie.nome,
          sinopse: movie.sinopse,
          duracao: movie.duracao,
          classificacao: movie.classificacao,
          genero: movie.genero,
          diretor: movie.diretor,
          elemento_principal: movie.elemento_principal,
          data_estreia: movie.data_estreia,
          url_poster: movie.url_poster,
          url_trailer: movie.url_trailer,
          schedules: schedulesWithCinemas,
          score: movieResult.score,
        };
      })
    );

    // Filter out movies with no active schedules
    const filteredResults = results.filter(
      (result) => result.schedules.length > 0
    );

    res.status(200).json({ results: filteredResults });
  } catch (error) {
    console.error("Error querying Qdrant:", error);
    res.status(500).json({ error: "Failed to process query" });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
