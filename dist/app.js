"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const multer = require("multer");
const xlsx_1 = require("xlsx");
const js_client_rest_1 = require("@qdrant/js-client-rest");
const openai_1 = require("openai");
const uuid_1 = require("uuid");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const qdrant = new js_client_rest_1.QdrantClient({ url: "http://localhost:6333" });
const MOVIES_COLLECTION = "movies";
const CINEMAS_COLLECTION = "cinemas";
const SCHEDULES_COLLECTION = "schedules";
async function collectionExists(collectionName) {
    try {
        await qdrant.getCollection(collectionName);
        return true;
    }
    catch (error) {
        return false;
    }
}
async function initializeCollections() {
    try {
        if (!(await collectionExists(MOVIES_COLLECTION))) {
            await qdrant.createCollection(MOVIES_COLLECTION, {
                vectors: {
                    size: 1536,
                    distance: "Cosine",
                },
            });
            console.log("Movies collection created");
        }
        if (!(await collectionExists(CINEMAS_COLLECTION))) {
            await qdrant.createCollection(CINEMAS_COLLECTION, {
                vectors: {
                    size: 1536,
                    distance: "Cosine",
                },
            });
            console.log("Cinemas collection created");
        }
        if (!(await collectionExists(SCHEDULES_COLLECTION))) {
            await qdrant.createCollection(SCHEDULES_COLLECTION, {});
            console.log("Schedules collection created");
        }
    }
    catch (error) {
        console.error("Error creating collections:", error);
        throw error;
    }
}
async function getEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
        });
        return response.data[0].embedding;
    }
    catch (error) {
        console.error("Error generating embedding:", error);
        throw new Error("Failed to generate embedding");
    }
}
app.post("/upload-excel", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        const workbook = (0, xlsx_1.read)(req.file.buffer, { type: "buffer" });
        const moviesSheet = workbook.Sheets["Filmes"];
        const programacaoSheet = workbook.Sheets["Programação"];
        const cinemasSheet = workbook.Sheets["Cinema"];
        const movies = require("xlsx").utils.sheet_to_json(moviesSheet);
        const schedules = require("xlsx").utils.sheet_to_json(programacaoSheet);
        const cinemas = require("xlsx").utils.sheet_to_json(cinemasSheet);
        await initializeCollections();
        const moviePoints = await Promise.all(movies.map(async (movie) => {
            const textToEmbed = `${movie.nome} ${movie.sinopse} ${movie.genero} ${movie.diretor} ${movie.elemento_principal || ""}`;
            const vector = await getEmbedding(textToEmbed);
            return {
                id: movie.id,
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
        }));
        await qdrant.upsert(MOVIES_COLLECTION, { points: moviePoints });
        const cinemaPoints = await Promise.all(cinemas.map(async (cinema) => {
            const textToEmbed = `${cinema.nome} ${cinema.endereco}`;
            const vector = await getEmbedding(textToEmbed);
            return {
                id: cinema.id,
                vector,
                payload: {
                    id: cinema.id,
                    nome: cinema.nome,
                    endereco: cinema.endereco,
                    url_conferir_horarios: cinema.url_conferir_horarios,
                    url_comprar_ingresso: cinema.url_comprar_ingresso,
                },
            };
        }));
        await qdrant.upsert(CINEMAS_COLLECTION, { points: cinemaPoints });
        const schedulePoints = schedules.map((schedule) => ({
            id: (0, uuid_1.v4)(),
            vector: [],
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
    }
    catch (error) {
        console.error("Error processing Excel:", error);
        res.status(500).json({ error: "Failed to process Excel file" });
    }
});
app.post("/query", async (req, res) => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== "string") {
            return res.status(400).json({ error: "Query string is required" });
        }
        const queryVector = await getEmbedding(query);
        const movieResults = await qdrant.search(MOVIES_COLLECTION, {
            vector: queryVector,
            limit: 10,
            filter: {
                must: [
                    {
                        key: "data_estreia",
                        range: {
                            lte: "2025-05-28",
                        },
                    },
                ],
            },
        });
        const results = await Promise.all(movieResults.map(async (movieResult) => {
            const movie = movieResult.payload;
            const scheduleResults = await qdrant.scroll(SCHEDULES_COLLECTION, {
                filter: {
                    must: [
                        { key: "id_filme", match: { value: movie.id } },
                        { key: "status", match: { value: "Em Cartaz" } },
                    ],
                },
                limit: 100,
            });
            const schedulesWithCinemas = await Promise.all(scheduleResults.points.map(async (schedulePoint) => {
                const schedule = schedulePoint.payload;
                const cinemaResult = await qdrant.retrieve(CINEMAS_COLLECTION, {
                    ids: [schedule.id_cinema],
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
            }));
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
        }));
        const filteredResults = results.filter((result) => result.schedules.length > 0);
        res.status(200).json({ results: filteredResults });
    }
    catch (error) {
        console.error("Error querying Qdrant:", error);
        res.status(500).json({ error: "Failed to process query" });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
//# sourceMappingURL=app.js.map