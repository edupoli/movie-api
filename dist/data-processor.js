"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExcelFile = parseExcelFile;
exports.generateEmbeddingsForData = generateEmbeddingsForData;
const XLSX = require("xlsx");
const axios_1 = require("axios");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ||
    "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";
const openaiClient = axios_1.default.create({
    baseURL: "https://api.openai.com/v1",
    headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
    },
});
async function getEmbedding(text) {
    try {
        const response = await openaiClient.post("/embeddings", {
            model: "text-embedding-3-small",
            input: text,
        });
        return response.data.data[0].embedding;
    }
    catch (error) {
        console.error("Error generating embedding:", error.message);
        throw new Error("Failed to generate embedding");
    }
}
function parseExcelFile(buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const moviesSheet = workbook.Sheets["Filmes"];
    const cinemasSheet = workbook.Sheets["Cinema"];
    const schedulesSheet = workbook.Sheets["Programação"];
    const moviesRaw = XLSX.utils.sheet_to_json(moviesSheet);
    const cinemasRaw = XLSX.utils.sheet_to_json(cinemasSheet);
    const schedulesRaw = XLSX.utils.sheet_to_json(schedulesSheet);
    const movies = moviesRaw.map((row) => ({
        id: row["id"],
        nome: row["nome"],
        sinopse: row["sinopse"],
        duracao: row["duracao"] === "-" ? null : parseFloat(row["duracao"]) || null,
        classificacao: row["classificacao"],
        genero: row["genero"],
        diretor: row["diretor"],
        elenco_principal: row["elenco_principal"],
        data_estreia: row["data_estreia"],
        url_poster: row["url_poster"],
        url_trailer: row["url_trailer"],
    }));
    const cinemas = cinemasRaw.map((row) => ({
        id: row["ID"],
        nome: row["Nome"],
        endereco: row["Endereço"],
        url_conferir_horarios: row["url_conferir_horarios"],
        url_comprar_ingresso: row["url_comprar_ingresso"],
    }));
    const schedules = schedulesRaw.map((row) => ({
        id_filme: row["id_filme"],
        id_cinema: row["id_cinema"],
        status: row["Status"],
        semana_inicio: row["Semana_Inicio"],
        semana_fim: row["Semana_Fim"],
        segunda: row["Segunda"],
        terca: row["Terça"],
        quarta: row["Quarta"],
        quinta: row["Quinta"],
        sexta: row["Sexta"],
        sabado: row["Sábado"],
        domingo: row["Domingo"],
    }));
    console.log("Parsed movies:", JSON.stringify(movies.slice(0, 5), null, 2));
    return { movies, cinemas, schedules };
}
async function generateEmbeddingsForData(movies, cinemas, schedules) {
    const movieEmbeddings = await Promise.all(movies.map(async (movie) => ({
        id: movie.id,
        embedding: await getEmbedding(`${movie.nome} ${movie.sinopse} ${movie.genero} ${movie.diretor} ${movie.elenco_principal || ""}`),
    })));
    const cinemaEmbeddings = await Promise.all(cinemas.map(async (cinema) => ({
        id: cinema.id,
        embedding: await getEmbedding(`${cinema.nome} ${cinema.endereco}`),
    })));
    const scheduleEmbeddings = await Promise.all(schedules.map(async (schedule) => ({
        id_filme: schedule.id_filme,
        id_cinema: schedule.id_cinema,
        embedding: await getEmbedding(`${schedule.status} ${schedule.semana_inicio} ${schedule.semana_fim} ${schedule.segunda || ""} ${schedule.terca || ""} ${schedule.quarta || ""} ${schedule.quinta || ""} ${schedule.sexta || ""} ${schedule.sabado || ""} ${schedule.domingo || ""}`),
    })));
    return { movieEmbeddings, cinemaEmbeddings, scheduleEmbeddings };
}
//# sourceMappingURL=data-processor.js.map