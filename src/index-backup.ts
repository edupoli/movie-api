// import * as express from "express";
// import { Request, Response } from "express";
// import { IMain, IDatabase } from "pg-promise";
// import * as pgPromise from "pg-promise";
// import axios from "axios";
// import * as dotenv from "dotenv";
// import * as winston from "winston";

// // Load environment variables
// dotenv.config();

// // Configure logging
// const logger = winston.createLogger({
//   level: "info",
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.json()
//   ),
//   transports: [new winston.transports.Console()],
// });

// // Initialize Express app
// const app = express();
// app.use(express.json());

// // Database setup
// const pgp: IMain = pgPromise();
// const db: IDatabase<any> = pgp({
//   host: process.env.DB_HOST || "localhost",
//   port: parseInt(process.env.DB_PORT || "5432"),
//   database: process.env.DB_NAME || "cinemas",
//   user: process.env.DB_USER || "postgres",
//   password: process.env.DB_PASSWORD || "postgres",
// });

// // Interfaces for TypeScript type safety
// interface QueryRequest {
//   mensagem: string;
//   tipo_necessidade?: string;
//   cinema?: string;
// }

// interface Movie {
//   id: number;
//   nome: string;
//   sinopse?: string;
//   duracao?: number;
//   classificacao?: string;
//   genero?: string;
//   diretor?: string;
//   elenco_principal?: string;
//   data_estreia?: string;
//   url_poster?: string;
//   url_trailer?: string;
// }

// interface Schedule {
//   segunda: string;
//   terca: string;
//   quarta: string;
//   quinta: string;
//   sexta: string;
//   sabado: string;
//   domingo: string;
// }

// // OpenAI API setup
// const OPENAI_API_KEY =
//   process.env.OPENAI_API_KEY ||
//   "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";
// const openaiClient = axios.create({
//   baseURL: "https://api.openai.com/v1",
//   headers: {
//     Authorization: `Bearer ${OPENAI_API_KEY}`,
//     "Content-Type": "application/json",
//   },
// });

// // SQL Prompt template
// const SQL_PROMPT = `
// You are a helpful assistant that converts natural language queries into PostgreSQL SQL queries. The database has three tables:

// 1. filmes (
//    id BIGSERIAL PRIMARY KEY,
//    nome VARCHAR(255) NOT NULL,
//    sinopse TEXT,
//    duracao NUMERIC(5,1),
//    classificacao VARCHAR(50),
//    genero VARCHAR(255),
//    diretor VARCHAR(255),
//    elenco_principal TEXT,
//    data_estreia TIMESTAMP,
//    url_poster VARCHAR(255),
//    url_trailer VARCHAR(255),
//    embedding vector(1536)
// )

// 2. cinemas (
//    id BIGSERIAL PRIMARY KEY,
//    nome VARCHAR(255) NOT NULL,
//    endereco TEXT,
//    url_conferir_horarios VARCHAR(255),
//    url_comprar_ingresso VARCHAR(255),
//    embedding vector(1536)
// )

// 3. programacao (
//    id BIGSERIAL PRIMARY KEY,
//    id_filme BIGINT REFERENCES filmes(id),
//    id_cinema BIGINT REFERENCES cinemas(id),
//    status VARCHAR(50),
//    semana_inicio DATE,
//    semana_fim DATE,
//    segunda TEXT,
//    terca TEXT,
//    quarta TEXT,
//    quinta TEXT,
//    sexta TEXT,
//    sabado TEXT,
//    domingo TEXT,
//    embedding vector(1536)
// )

// Given the natural language query (stored in 'mensagem'), generate ONLY the raw SQL query string with no additional text, formatting, or backticks (e.g., no \`\`\`). Use case-insensitive matching with LOWER() for string comparisons. Always include a JOIN with the 'cinemas' table and filter by the 'cinema' parameter if provided. Examples:
// - Mensagem: "quais são os filmes cadastrados?" → SELECT f.* FROM filmes f JOIN programacao p ON f.id = p.id_filme JOIN cinemas c ON p.id_cinema = c.id
// - Mensagem: "quais são os filmes em cartaz?" → SELECT f.* FROM filmes f JOIN programacao p ON f.id = p.id_filme JOIN cinemas c ON p.id_cinema = c.id WHERE LOWER(p.status) = LOWER('em cartaz') AND LOWER(c.nome) = LOWER('Cine Center')
// - Mensagem: "quais são os horários do filme Branca de neve?" → SELECT p.segunda, p.terca, p.quarta, p.quinta, p.sexta, p.sabado, p.domingo FROM filmes f JOIN programacao p ON f.id = p.id_filme JOIN cinemas c ON p.id_cinema = c.id WHERE LOWER(f.nome) = LOWER('branca de neve') AND LOWER(c.nome) = LOWER('Cine Center')

// Query: {query}
// `;

// async function textToSql(query: string, cinema?: string): Promise<string> {
//   try {
//     const response = await openaiClient.post("/chat/completions", {
//       model: "gpt-4o-mini",
//       messages: [
//         { role: "system", content: SQL_PROMPT.replace("{query}", query) },
//         { role: "user", content: query },
//       ],
//       temperature: 0.0,
//     });

//     let sqlQuery: string = response.data.choices[0].message.content.trim();
//     // Clean any residual backticks or newlines
//     sqlQuery = sqlQuery.replace(/```/g, "").replace(/\n/g, " ").trim();
//     logger.info(`Cleaned SQL query: ${sqlQuery}`);

//     // If cinema is provided, ensure it's included in the WHERE clause if not already present
//     if (
//       cinema &&
//       !sqlQuery
//         .toLowerCase()
//         .includes(`lower(c.nome) = lower('${cinema.toLowerCase()}')`)
//     ) {
//       sqlQuery += ` AND LOWER(c.nome) = LOWER('${cinema.toLowerCase()}')`;
//     }

//     return sqlQuery;
//   } catch (error: any) {
//     logger.error(`Error generating SQL with OpenAI: ${error.message}`);
//     throw new Error("Error generating SQL query");
//   }
// }

// async function getEmbedding(query: string): Promise<number[]> {
//   try {
//     const response = await openaiClient.post("/embeddings", {
//       model: "text-embedding-ada-002",
//       input: query,
//     });

//     const embedding: number[] = response.data.data[0].embedding;
//     return embedding;
//   } catch (error: any) {
//     logger.error(`Error generating embedding: ${error.message}`);
//     throw new Error("Error generating embedding");
//   }
// }

// async function executeSql(sqlQuery: string): Promise<any[]> {
//   try {
//     const result = await db.any(sqlQuery);

//     // Serialize non-JSON-serializable types and exclude embedding
//     const resultDict = result.map((record: any) => {
//       const serialized: any = {};
//       for (const [key, value] of Object.entries(record)) {
//         if (key === "embedding") continue; // Exclude embedding
//         if (typeof value === "number" && !Number.isInteger(value)) {
//           serialized[key] = parseFloat(value.toFixed(1)); // Handle Decimal-like numbers
//         } else if (value instanceof Date) {
//           serialized[key] = value.toISOString(); // Handle timestamps
//         } else {
//           serialized[key] = value;
//         }
//       }
//       return serialized;
//     });

//     return resultDict;
//   } catch (error: any) {
//     logger.error(`Error executing SQL: ${error.message}`);
//     throw new Error(`Database error: ${error.message}`);
//   }
// }

// async function semanticSearch(
//   table: string,
//   query: string,
//   limit: number = 5,
//   cinema?: string
// ): Promise<any[]> {
//   const queryEmbedding = await getEmbedding(query);
//   const vectorStr = `[${queryEmbedding.join(",")}]`;

//   let sqlQuery = `
//     SELECT * FROM ${table}
//     JOIN programacao p ON ${table}.id = p.id_filme
//     JOIN cinemas c ON p.id_cinema = c.id
//     WHERE 1=1
//   `;
//   if (cinema) {
//     sqlQuery += ` AND LOWER(c.nome) = LOWER('${cinema.toLowerCase()}')`;
//   }
//   sqlQuery += ` ORDER BY embedding <=> $1 LIMIT ${limit}`;

//   try {
//     const result = await db.any(sqlQuery, [vectorStr]);

//     // Serialize non-JSON-serializable types and exclude embedding
//     const resultDict = result.map((record: any) => {
//       const serialized: any = {};
//       for (const [key, value] of Object.entries(record)) {
//         if (key === "embedding") continue; // Exclude embedding
//         if (typeof value === "number" && !Number.isInteger(value)) {
//           serialized[key] = parseFloat(value.toFixed(1)); // Handle Decimal-like numbers
//         } else if (value instanceof Date) {
//           serialized[key] = value.toISOString(); // Handle timestamps
//         } else {
//           serialized[key] = value;
//         }
//       }
//       return serialized;
//     });

//     return resultDict;
//   } catch (error: any) {
//     logger.error(`Error in semantic search: ${error.message}`);
//     throw new Error(`Semantic search error: ${error.message}`);
//   }
// }

// app.post("/query", async (req: Request, res: Response): Promise<any> => {
//   const {
//     mensagem,
//     tipo_necessidade = "detalhes",
//     cinema,
//   }: QueryRequest = req.body;

//   if (!mensagem) {
//     return res.status(400).json({ detail: "Mensagem is required" });
//   }

//   const mensagemLower = mensagem.toLowerCase().trim();
//   const tipoNecessidadeLower = tipo_necessidade.toLowerCase().trim();
//   const cinemaLower = cinema?.toLowerCase().trim() || null;

//   logger.info(
//     `Received mensagem: ${mensagemLower}, tipo_necessidade: ${tipoNecessidadeLower}, cinema: ${cinemaLower}`
//   );

//   if (
//     mensagemLower.includes("em cartaz") ||
//     mensagemLower.includes("horarios")
//   ) {
//     const statusValues = await db.any(
//       "SELECT DISTINCT status FROM programacao;"
//     );
//     logger.info(
//       `Distinct status values in programacao: ${statusValues.map(
//         (row: any) => row.status
//       )}`
//     );
//   }

//   const semanticKeywords = ["similar to", "parecido com", "like"];
//   const isSemantic = semanticKeywords.some((keyword) =>
//     mensagemLower.includes(keyword)
//   );
//   const isSchedule =
//     mensagemLower.includes("horarios") || mensagemLower.includes("horário");

//   try {
//     let result: any[];
//     if (isSemantic) {
//       if (mensagemLower.includes("filme") || mensagemLower.includes("movie")) {
//         result = await semanticSearch("filmes", mensagemLower, 5, cinemaLower);
//       } else if (mensagemLower.includes("cinema")) {
//         result = await semanticSearch("cinemas", mensagemLower, 5, cinemaLower);
//       } else if (
//         mensagemLower.includes("programacao") ||
//         mensagemLower.includes("horario")
//       ) {
//         result = await semanticSearch(
//           "programacao",
//           mensagemLower,
//           5,
//           cinemaLower
//         );
//       } else {
//         return res
//           .status(400)
//           .json({ detail: "Unclear which table to search" });
//       }
//     } else {
//       const sqlQuery = await textToSql(mensagemLower, cinemaLower);
//       logger.info(`Generated SQL: ${sqlQuery}`);
//       result = await executeSql(sqlQuery);
//     }

//     // Process results based on tipo_necessidade and query type
//     if (!isSchedule && tipoNecessidadeLower === "lista") {
//       result = result
//         .filter((item) => "nome" in item)
//         .map((item) => ({ nome: item.nome }));
//     } else if (!isSchedule && tipoNecessidadeLower === "detalhes") {
//       // No change needed, return full details
//     }
//     // For schedule queries, ignore tipo_necessidade and return as is

//     return res.json(result);
//   } catch (error: any) {
//     return res.status(500).json({ detail: error.message });
//   }
// });

// // Start the server and initialize Redis
// async function startServer() {
//   const PORT = 8000;
//   app.listen(PORT, () => {
//     logger.info(`Server is running on port ${PORT}`);
//   });
// }

// startServer().catch((error) => {
//   logger.error("Server startup failed", error);
//   process.exit(1);
// });
import * as express from "express";
import { Request, Response } from "express";
import axios from "axios";
import * as dotenv from "dotenv";
import * as winston from "winston";
import { generateEmbeddingsForData } from "./data-processor";
import * as multer from "multer";
import { read, WorkBook, WorkSheet } from "xlsx";
import { db } from "./database";

// Load environment variables
dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Initialize Express app
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

// Interfaces for TypeScript type safety
interface QueryRequest {
  mensagem: string;
  tipo_necessidade?: string;
  cinema?: string;
}

interface Movie {
  id: number;
  nome: string;
  sinopse?: string;
  duracao?: number;
  classificacao?: string;
  genero?: string;
  diretor?: string;
  elenco_principal?: string;
  data_estreia?: string;
  url_poster?: string;
  url_trailer?: string;
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
// OpenAI API setup
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openaiClient = axios.create({
  baseURL: "https://api.openai.com/v1",
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// SQL Prompt template with spelling correction
const SQL_PROMPT = `
You are a helpful assistant that converts natural language queries into PostgreSQL SQL queries. The database has three tables:

1. filmes (
   id BIGSERIAL PRIMARY KEY,
   nome VARCHAR(255) NOT NULL,
   sinopse TEXT,
   duracao NUMERIC(5,1),
   classificacao VARCHAR(50),
   genero VARCHAR(255),
   diretor VARCHAR(255),
   elenco_principal TEXT,
   data_estreia TIMESTAMP,
   url_poster VARCHAR(255),
   url_trailer VARCHAR(255),
   embedding vector(1536)
)

2. cinemas (
   id BIGSERIAL PRIMARY KEY,
   nome VARCHAR(255) NOT NULL,
   endereco TEXT,
   url_conferir_horarios VARCHAR(255),
   url_comprar_ingresso VARCHAR(255),
   embedding vector(1536)
)

3. programacao (
   id BIGSERIAL PRIMARY KEY,
   id_filme BIGINT REFERENCES filmes(id),
   id_cinema BIGINT REFERENCES cinemas(id),
   status VARCHAR(50),
   semana_inicio DATE,
   semana_fim DATE,
   segunda TEXT,
   terca TEXT,
   quarta TEXT,
   quinta TEXT,
   sexta TEXT,
   sabado TEXT,
   domingo TEXT,
   embedding vector(1536)
)

Given the natural language query (stored in 'mensagem'), generate ONLY the raw SQL query string with no additional text, formatting, or backticks (e.g., no \`\`\`). Use case-insensitive matching with LOWER() for string comparisons. Always include a JOIN with the 'cinemas' table and filter by the 'cinema' parameter if provided. If the query involves a movie name (e.g., in "quais são os horários do filme X?"), detect potential spelling errors in the movie name and correct them based on common movie titles (e.g., correct 'banca de neve' to 'branca de neve' or 'branca de neves' to 'branca de neve'). Use your knowledge to approximate the correct name if a typo is suspected. Examples:
- Mensagem: "quais são os filmes cadastrados?" → SELECT f.* FROM filmes f JOIN programacao p ON f.id = p.id_filme JOIN cinemas c ON p.id_cinema = c.id
- Mensagem: "quais são os filmes em cartaz?" → SELECT f.* FROM filmes f JOIN programacao p ON f.id = p.id_filme JOIN cinemas c ON p.id_cinema = c.id WHERE LOWER(p.status) = LOWER('em cartaz') AND LOWER(c.nome) = LOWER('Cine Center')
- Mensagem: "quais são os horários do filme banca de neve?" → SELECT p.segunda, p.terca, p.quarta, p.quinta, p.sexta, p.sabado, p.domingo FROM filmes f JOIN programacao p ON f.id = p.id_filme JOIN cinemas c ON p.id_cinema = c.id WHERE LOWER(f.nome) = LOWER('branca de neve') AND LOWER(c.nome) = LOWER('Cine Center')
- Mensagem: "quais são os horários do filme branca de neves?" → SELECT p.segunda, p.terca, p.quarta, p.quinta, p.sexta, p.sabado, p.domingo FROM filmes f JOIN programacao p ON f.id = p.id_filme JOIN cinemas c ON p.id_cinema = c.id WHERE LOWER(f.nome) = LOWER('branca de neve') AND LOWER(c.nome) = LOWER('Cine Center')

Query: {query}
`;

async function textToSql(query: string, cinema?: string): Promise<string> {
  try {
    const response = await openaiClient.post("/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SQL_PROMPT.replace("{query}", query) },
        { role: "user", content: query },
      ],
      temperature: 0.0,
    });

    let sqlQuery: string = response.data.choices[0].message.content.trim();
    // Clean any residual backticks or newlines
    sqlQuery = sqlQuery.replace(/```/g, "").replace(/\n/g, " ").trim();
    logger.info(`Cleaned SQL query: ${sqlQuery}`);

    // If cinema is provided, ensure it's included in the WHERE clause if not already present
    if (
      cinema &&
      !sqlQuery
        .toLowerCase()
        .includes(`lower(c.nome) = lower('${cinema.toLowerCase()}')`)
    ) {
      sqlQuery += ` AND LOWER(c.nome) = LOWER('${cinema.toLowerCase()}')`;
    }

    return sqlQuery;
  } catch (error: any) {
    logger.error(`Error generating SQL with OpenAI: ${error.message}`);
    throw new Error("Error generating SQL query");
  }
}

async function getEmbedding(query: string): Promise<number[]> {
  try {
    const response = await openaiClient.post("/embeddings", {
      model: "text-embedding-ada-002",
      input: query,
    });

    const embedding: number[] = response.data.data[0].embedding;
    return embedding;
  } catch (error: any) {
    logger.error(`Error generating embedding: ${error.message}`);
    throw new Error("Error generating embedding");
  }
}

async function executeSql(sqlQuery: string): Promise<any[]> {
  try {
    const result = await db.any(sqlQuery);

    // Serialize non-JSON-serializable types and exclude embedding
    const resultDict = result.map((record: any) => {
      const serialized: any = {};
      for (const [key, value] of Object.entries(record)) {
        if (key === "embedding") continue; // Exclude embedding
        if (typeof value === "number" && !Number.isInteger(value)) {
          serialized[key] = parseFloat(value.toFixed(1)); // Handle Decimal-like numbers
        } else if (value instanceof Date) {
          serialized[key] = value.toISOString(); // Handle timestamps
        } else {
          serialized[key] = value;
        }
      }
      return serialized;
    });

    return resultDict;
  } catch (error: any) {
    logger.error(`Error executing SQL: ${error.message}`);
    throw new Error(`Database error: ${error.message}`);
  }
}

async function semanticSearch(
  table: string,
  query: string,
  limit: number = 5,
  cinema?: string
): Promise<any[]> {
  const queryEmbedding = await getEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  let sqlQuery = `
    SELECT * FROM ${table}
    JOIN programacao p ON ${table}.id = p.id_filme
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE 1=1
  `;
  if (cinema) {
    sqlQuery += ` AND LOWER(c.nome) = LOWER('${cinema.toLowerCase()}')`;
  }
  sqlQuery += ` ORDER BY embedding <=> $1 LIMIT ${limit}`;

  try {
    const result = await db.any(sqlQuery, [vectorStr]);

    // Serialize non-JSON-serializable types and exclude embedding
    const resultDict = result.map((record: any) => {
      const serialized: any = {};
      for (const [key, value] of Object.entries(record)) {
        if (key === "embedding") continue; // Exclude embedding
        if (typeof value === "number" && !Number.isInteger(value)) {
          serialized[key] = parseFloat(value.toFixed(1)); // Handle Decimal-like numbers
        } else if (value instanceof Date) {
          serialized[key] = value.toISOString(); // Handle timestamps
        } else {
          serialized[key] = value;
        }
      }
      return serialized;
    });

    return resultDict;
  } catch (error: any) {
    logger.error(`Error in semantic search: ${error.message}`);
    throw new Error(`Semantic search error: ${error.message}`);
  }
}

async function getMovieSuggestions(): Promise<string[]> {
  try {
    const movies = await db.any("SELECT nome FROM filmes");
    return movies.map((movie: any) => movie.nome.toLowerCase());
  } catch (error: any) {
    logger.error(`Error fetching movie suggestions: ${error.message}`);
    return [];
  }
}

app.post("/query", async (req: Request, res: Response): Promise<any> => {
  const {
    mensagem,
    tipo_necessidade = "detalhes",
    cinema,
  }: QueryRequest = req.body;

  if (!mensagem) {
    return res.status(400).json({ detail: "Mensagem is required" });
  }

  const mensagemLower = mensagem.toLowerCase().trim();
  const tipoNecessidadeLower = tipo_necessidade.toLowerCase().trim();
  const cinemaLower = cinema?.toLowerCase().trim() || null;

  logger.info(
    `Received mensagem: ${mensagemLower}, tipo_necessidade: ${tipoNecessidadeLower}, cinema: ${cinemaLower}`
  );

  if (
    mensagemLower.includes("em cartaz") ||
    mensagemLower.includes("horarios")
  ) {
    const statusValues = await db.any(
      "SELECT DISTINCT status FROM programacao;"
    );
    logger.info(
      `Distinct status values in programacao: ${statusValues.map(
        (row: any) => row.status
      )}`
    );
  }

  const semanticKeywords = ["similar to", "parecido com", "like"];
  const isSemantic = semanticKeywords.some((keyword) =>
    mensagemLower.includes(keyword)
  );
  const isSchedule =
    mensagemLower.includes("horarios") || mensagemLower.includes("horário");

  try {
    let result: any[];
    if (isSemantic) {
      if (mensagemLower.includes("filme") || mensagemLower.includes("movie")) {
        result = await semanticSearch("filmes", mensagemLower, 5, cinemaLower);
      } else if (mensagemLower.includes("cinema")) {
        result = await semanticSearch("cinemas", mensagemLower, 5, cinemaLower);
      } else if (
        mensagemLower.includes("programacao") ||
        mensagemLower.includes("horario")
      ) {
        result = await semanticSearch(
          "programacao",
          mensagemLower,
          5,
          cinemaLower
        );
      } else {
        return res
          .status(400)
          .json({ detail: "Unclear which table to search" });
      }
    } else {
      let sqlQuery = await textToSql(mensagemLower, cinemaLower);
      logger.info(`Generated SQL: ${sqlQuery}`);
      result = await executeSql(sqlQuery);

      // If no results and it's a schedule query, attempt to correct movie name
      if (isSchedule && result.length === 0) {
        const movieMatch = mensagemLower.match(/filme\s+(.+)/i);
        if (movieMatch) {
          const typoMovie = movieMatch[1].trim();
          const movieSuggestions = await getMovieSuggestions();
          // Simple heuristic: use the LLM to suggest a correction if no exact match
          const correctionPrompt = `
            The user queried for a movie schedule with a possible typo: "${typoMovie}". 
            Based on the following list of valid movie names: ${movieSuggestions.join(
              ", "
            )}, 
            suggest the most likely correct movie name. Return ONLY the corrected name.
          `;
          const correctionResponse = await openaiClient.post(
            "/chat/completions",
            {
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: correctionPrompt },
                { role: "user", content: typoMovie },
              ],
              temperature: 0.0,
            }
          );
          const correctedMovie =
            correctionResponse.data.choices[0].message.content.trim();
          if (correctedMovie && correctedMovie !== typoMovie) {
            logger.info(
              `Corrected movie name from "${typoMovie}" to "${correctedMovie}"`
            );
            sqlQuery = await textToSql(
              mensagemLower.replace(typoMovie, correctedMovie),
              cinemaLower
            );
            result = await executeSql(sqlQuery);
          }
        }
      }
    }

    // Process results based on tipo_necessidade and query type
    if (!isSchedule && tipoNecessidadeLower === "lista") {
      result = result
        .filter((item) => "nome" in item)
        .map((item) => ({ nome: item.nome }));
    } else if (!isSchedule && tipoNecessidadeLower === "detalhes") {
      // No change needed, return full details
    }
    // For schedule queries, ignore tipo_necessidade and return as is

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
});
// app.post(
//   "/upload",
//   upload.single("file"),
//   async (req: Request, res: Response): Promise<any> => {
//     try {
//       if (!req.file) {
//         return res.status(400).json({ error: "No file uploaded" });
//       }

//       const { movies, cinemas, schedules } = parseExcelFile(req.file.buffer);
//       const { movieEmbeddings, cinemaEmbeddings, scheduleEmbeddings } =
//         await generateEmbeddingsForData(movies, cinemas, schedules);

//       await insertMovies(movies, movieEmbeddings);
//       await insertCinemas(cinemas, cinemaEmbeddings);
//       await insertSchedules(schedules, scheduleEmbeddings);

//       logger.info(
//         "Data and embeddings successfully inserted into the database"
//       );
//       res
//         .status(200)
//         .json({ message: "Data uploaded and processed successfully" });
//     } catch (error: any) {
//       logger.error(`Error processing upload: ${error.message}`);
//       res.status(500).json({ detail: error.message });
//     }
//   }
// );

// Process Excel file and insert into database
app.post(
  "/upload-excel",
  upload.single("file"),
  async (req: Request, res: Response): Promise<any> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Parse Excel file
      const workbook = read(req.file.buffer, {
        type: "buffer",
        cellDates: true,
      });

      const moviesSheet: WorkSheet = workbook.Sheets["Filmes"];
      const programacaoSheet: WorkSheet = workbook.Sheets["Programação"];
      const cinemasSheet: WorkSheet = workbook.Sheets["Cinema"];

      // Convert sheets to JSON
      const movies: Movie[] = require("xlsx").utils.sheet_to_json(moviesSheet);
      const schedules: Schedule[] =
        require("xlsx").utils.sheet_to_json(programacaoSheet);
      const cinemas: Cinema[] =
        require("xlsx").utils.sheet_to_json(cinemasSheet);

      console.log(movies);
      // Gerar embeddings
      const { movieEmbeddings, cinemaEmbeddings, scheduleEmbeddings } =
        await generateEmbeddingsForData(movies, cinemas, schedules);

      // Inserir dados no banco de dados

      logger.info(
        "Data and embeddings successfully inserted into the database"
      );

      res.status(200).json({
        message: "Data uploaded and processed successfully",
        stats: {
          movies: movies.length,
          cinemas: cinemas.length,
          schedules: schedules.length,
        },
      });
    } catch (error) {
      console.error("Error processing Excel:", error);
      res.status(500).json({
        error: "Failed to process Excel file",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Start the server
async function startServer() {
  const PORT = 8000;
  app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  logger.error("Server startup failed", error);
  process.exit(1);
});
