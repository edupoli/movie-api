"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const axios_1 = require("axios");
const dotenv = require("dotenv");
const winston = require("winston");
const data_processor_1 = require("./data-processor");
const multer = require("multer");
const xlsx_1 = require("xlsx");
const database_1 = require("./database");
const pgp = require("pg-promise");
dotenv.config();
const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ||
    "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";
const openaiClient = axios_1.default.create({
    baseURL: "https://api.openai.com/v1",
    headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
    },
});
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
const pgpLocal = pgp();
async function textToSql(query, cinema) {
    try {
        const response = await openaiClient.post("/chat/completions", {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SQL_PROMPT.replace("{query}", query) },
                { role: "user", content: query },
            ],
            temperature: 0.0,
        });
        let sqlQuery = response.data.choices[0].message.content.trim();
        sqlQuery = sqlQuery.replace(/```/g, "").replace(/\n/g, " ").trim();
        logger.info(`Cleaned SQL query: ${sqlQuery}`);
        if (cinema &&
            !sqlQuery
                .toLowerCase()
                .includes(`lower(c.nome) = lower('${cinema.toLowerCase()}')`)) {
            sqlQuery += ` AND LOWER(c.nome) = LOWER('${cinema.toLowerCase()}')`;
        }
        return sqlQuery;
    }
    catch (error) {
        logger.error(`Error generating SQL with OpenAI: ${error.message}`);
        throw new Error("Error generating SQL query");
    }
}
async function getEmbedding(query) {
    try {
        const response = await openaiClient.post("/embeddings", {
            model: "text-embedding-ada-002",
            input: query,
        });
        const embedding = response.data.data[0].embedding;
        return embedding;
    }
    catch (error) {
        logger.error(`Error generating embedding: ${error.message}`);
        throw new Error("Error generating embedding");
    }
}
async function executeSql(sqlQuery) {
    try {
        const result = await database_1.db.any(sqlQuery);
        const resultDict = result.map((record) => {
            const serialized = {};
            for (const [key, value] of Object.entries(record)) {
                if (key === "embedding")
                    continue;
                if (typeof value === "number" && !Number.isInteger(value)) {
                    serialized[key] = parseFloat(value.toFixed(1));
                }
                else if (value instanceof Date) {
                    serialized[key] = value.toISOString();
                }
                else {
                    serialized[key] = value;
                }
            }
            return serialized;
        });
        return resultDict;
    }
    catch (error) {
        logger.error(`Error executing SQL: ${error.message}`);
        throw new Error(`Database error: ${error.message}`);
    }
}
async function semanticSearch(table, query, limit = 5, cinema) {
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
        const result = await database_1.db.any(sqlQuery, [vectorStr]);
        const resultDict = result.map((record) => {
            const serialized = {};
            for (const [key, value] of Object.entries(record)) {
                if (key === "embedding")
                    continue;
                if (typeof value === "number" && !Number.isInteger(value)) {
                    serialized[key] = parseFloat(value.toFixed(1));
                }
                else if (value instanceof Date) {
                    serialized[key] = value.toISOString();
                }
                else {
                    serialized[key] = value;
                }
            }
            return serialized;
        });
        return resultDict;
    }
    catch (error) {
        logger.error(`Error in semantic search: ${error.message}`);
        throw new Error(`Semantic search error: ${error.message}`);
    }
}
async function getMovieSuggestions() {
    try {
        const movies = await database_1.db.any("SELECT nome FROM filmes");
        return movies.map((movie) => movie.nome.toLowerCase());
    }
    catch (error) {
        logger.error(`Error fetching movie suggestions: ${error.message}`);
        return [];
    }
}
app.post("/query", async (req, res) => {
    const { mensagem, tipo_necessidade = "detalhes", cinema, } = req.body;
    if (!mensagem) {
        return res.status(400).json({ detail: "Mensagem is required" });
    }
    const mensagemLower = mensagem.toLowerCase().trim();
    const tipoNecessidadeLower = tipo_necessidade.toLowerCase().trim();
    const cinemaLower = cinema?.toLowerCase().trim() || null;
    logger.info(`Received mensagem: ${mensagemLower}, tipo_necessidade: ${tipoNecessidadeLower}, cinema: ${cinemaLower}`);
    if (mensagemLower.includes("em cartaz") ||
        mensagemLower.includes("horarios")) {
        const statusValues = await database_1.db.any("SELECT DISTINCT status FROM programacao;");
        logger.info(`Distinct status values in programacao: ${statusValues.map((row) => row.status)}`);
    }
    const semanticKeywords = ["similar to", "parecido com", "like"];
    const isSemantic = semanticKeywords.some((keyword) => mensagemLower.includes(keyword));
    const isSchedule = mensagemLower.includes("horarios") || mensagemLower.includes("horário");
    try {
        let result;
        if (isSemantic) {
            if (mensagemLower.includes("filme") || mensagemLower.includes("movie")) {
                result = await semanticSearch("filmes", mensagemLower, 5, cinemaLower);
            }
            else if (mensagemLower.includes("cinema")) {
                result = await semanticSearch("cinemas", mensagemLower, 5, cinemaLower);
            }
            else if (mensagemLower.includes("programacao") ||
                mensagemLower.includes("horario")) {
                result = await semanticSearch("programacao", mensagemLower, 5, cinemaLower);
            }
            else {
                return res
                    .status(400)
                    .json({ detail: "Unclear which table to search" });
            }
        }
        else {
            let sqlQuery = await textToSql(mensagemLower, cinemaLower);
            logger.info(`Generated SQL: ${sqlQuery}`);
            result = await executeSql(sqlQuery);
            if (isSchedule && result.length === 0) {
                const movieMatch = mensagemLower.match(/filme\s+(.+)/i);
                if (movieMatch) {
                    const typoMovie = movieMatch[1].trim();
                    const movieSuggestions = await getMovieSuggestions();
                    const correctionPrompt = `
            The user queried for a movie schedule with a possible typo: "${typoMovie}".
            Based on the following list of valid movie names: ${movieSuggestions.join(", ")},
            suggest the most likely correct movie name. Return ONLY the corrected name.
          `;
                    const correctionResponse = await openaiClient.post("/chat/completions", {
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: correctionPrompt },
                            { role: "user", content: typoMovie },
                        ],
                        temperature: 0.0,
                    });
                    const correctedMovie = correctionResponse.data.choices[0].message.content.trim();
                    if (correctedMovie && correctedMovie !== typoMovie) {
                        logger.info(`Corrected movie name from "${typoMovie}" to "${correctedMovie}"`);
                        sqlQuery = await textToSql(mensagemLower.replace(typoMovie, correctedMovie), cinemaLower);
                        result = await executeSql(sqlQuery);
                    }
                }
            }
        }
        if (!isSchedule && tipoNecessidadeLower === "lista") {
            result = result
                .filter((item) => "nome" in item)
                .map((item) => ({ nome: item.nome }));
        }
        else if (!isSchedule && tipoNecessidadeLower === "detalhes") {
        }
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({ detail: error.message });
    }
});
async function insertMovies(movies) {
    if (movies.length === 0)
        return [];
    const cs = new pgpLocal.helpers.ColumnSet([
        "nome",
        "sinopse",
        "duracao",
        "classificacao",
        "genero",
        "diretor",
        "elenco_principal",
        { name: "data_estreia", cast: "TIMESTAMP" },
        "url_poster",
        "url_trailer",
    ], { table: "filmes" });
    const data = movies.map((movie) => ({
        nome: movie.nome,
        sinopse: movie.sinopse || null,
        duracao: movie.duracao || null,
        classificacao: movie.classificacao || null,
        genero: movie.genero || null,
        diretor: movie.diretor || null,
        elenco_principal: movie.elenco_principal || null,
        data_estreia: movie.data_estreia ? new Date(movie.data_estreia) : null,
        url_poster: movie.url_poster || null,
        url_trailer: movie.url_trailer || null,
    }));
    const query = pgpLocal.helpers.insert(data, cs) + " RETURNING id, nome";
    return await database_1.db.many(query);
}
async function insertCinemas(cinemas) {
    if (cinemas.length === 0)
        return [];
    const cs = new pgpLocal.helpers.ColumnSet([
        "nome",
        "endereco",
        "url_conferir_horarios",
        "url_comprar_ingresso",
    ], { table: "cinemas" });
    const data = cinemas.map((cinema) => ({
        nome: cinema.nome,
        endereco: cinema.endereco,
        url_conferir_horarios: cinema.url_conferir_horarios || null,
        url_comprar_ingresso: cinema.url_comprar_ingresso || null,
    }));
    const query = pgpLocal.helpers.insert(data, cs) + " RETURNING id, nome, endereco";
    return await database_1.db.many(query);
}
async function insertSchedules(schedules, movieMap, cinemaMap, scheduleEmbeddings) {
    if (schedules.length === 0)
        return;
    const cs = new pgpLocal.helpers.ColumnSet([
        "id_filme",
        "id_cinema",
        "status",
        { name: "semana_inicio", cast: "DATE" },
        { name: "semana_fim", cast: "DATE" },
        "segunda",
        "terca",
        "quarta",
        "quinta",
        "sexta",
        "sabado",
        "domingo",
        { name: "embedding", mod: ":json" },
    ], { table: "programacao" });
    const data = schedules
        .map((schedule) => {
        const dbMovieId = movieMap.get(schedule.id_filme_excel);
        const dbCinemaId = cinemaMap.get(schedule.id_cinema_excel);
        const embeddingData = scheduleEmbeddings.find((emb) => emb.id_filme_excel === schedule.id_filme_excel &&
            emb.id_cinema_excel === schedule.id_cinema_excel);
        if (dbMovieId !== undefined &&
            dbCinemaId !== undefined &&
            embeddingData) {
            return {
                id_filme: dbMovieId,
                id_cinema: dbCinemaId,
                status: schedule.status,
                semana_inicio: schedule.semana_inicio
                    ? new Date(schedule.semana_inicio)
                    : null,
                semana_fim: schedule.semana_fim
                    ? new Date(schedule.semana_fim)
                    : null,
                segunda: schedule.segunda || null,
                terca: schedule.terca || null,
                quarta: schedule.quarta || null,
                quinta: schedule.quinta || null,
                sexta: schedule.sexta || null,
                sabado: schedule.sabado || null,
                domingo: schedule.domingo || null,
                embedding: embeddingData.embedding,
            };
        }
        logger.warn(`Skipping schedule entry due to missing mapping or embedding: Movie Excel ID ${schedule.id_filme_excel}, Cinema Excel ID ${schedule.id_cinema_excel}`);
        return null;
    })
        .filter((item) => item !== null);
    if (data.length > 0) {
        await database_1.db.none(pgpLocal.helpers.insert(data, cs));
    }
}
app.post("/upload-excel", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        const workbook = (0, xlsx_1.read)(req.file.buffer, {
            type: "buffer",
            cellDates: true,
        });
        const moviesSheet = workbook.Sheets["Filmes"];
        const programacaoSheet = workbook.Sheets["Programação"];
        const cinemasSheet = workbook.Sheets["Cinema"];
        const movies = require("xlsx").utils.sheet_to_json(moviesSheet);
        const schedules = require("xlsx").utils.sheet_to_json(programacaoSheet);
        const cinemas = require("xlsx").utils.sheet_to_json(cinemasSheet);
        movies.forEach((m) => (m.id_excel = m.id));
        cinemas.forEach((c) => (c.id_excel = c.id));
        schedules.forEach((s) => {
            s.id_excel = s.id;
            s.id_filme_excel = s.id_filme;
            s.id_cinema_excel = s.id_cinema;
            delete s.id;
            delete s.id_filme;
            delete s.id_cinema;
        });
        const insertedMovies = await insertMovies(movies);
        const insertedCinemas = await insertCinemas(cinemas);
        const movieMap = new Map();
        movies.forEach((movie) => {
            const inserted = insertedMovies.find((im) => im.nome === movie.nome);
            if (inserted && movie.id_excel !== undefined) {
                movieMap.set(movie.id_excel, inserted.id);
            }
            else {
                logger.warn(`Could not map movie "${movie.nome}" (Excel ID: ${movie.id_excel}) to a database ID.`);
            }
        });
        const cinemaMap = new Map();
        cinemas.forEach((cinema) => {
            const inserted = insertedCinemas.find((ic) => ic.nome === cinema.nome && ic.endereco === cinema.endereco);
            if (inserted && cinema.id_excel !== undefined) {
                cinemaMap.set(cinema.id_excel, inserted.id);
            }
            else {
                logger.warn(`Could not map cinema "${cinema.nome}" at "${cinema.endereco}" (Excel ID: ${cinema.id_excel}) to a database ID.`);
            }
        });
        const { movieEmbeddings, cinemaEmbeddings, scheduleEmbeddings } = await (0, data_processor_1.generateEmbeddingsForData)(movies, cinemas, schedules);
        const mappedScheduleEmbeddings = scheduleEmbeddings.map((emb) => ({
            id_filme_excel: emb.id_filme,
            id_cinema_excel: emb.id_cinema,
            embedding: emb.embedding,
        }));
        await insertSchedules(schedules, movieMap, cinemaMap, mappedScheduleEmbeddings);
        logger.info("Data successfully inserted into the database (excluding movie/cinema embeddings update)");
        res.status(200).json({
            message: "Data uploaded and processed successfully",
            stats: {
                movies: insertedMovies.length,
                cinemas: insertedCinemas.length,
                schedules: schedules.filter((s) => movieMap.has(s.id_filme_excel) && cinemaMap.has(s.id_cinema_excel)).length,
            },
        });
    }
    catch (error) {
        console.error("Error processing Excel:", error);
        res.status(500).json({
            error: "Failed to process Excel file",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
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
//# sourceMappingURL=index.js.map