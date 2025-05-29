"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertMovies = insertMovies;
exports.insertCinemas = insertCinemas;
exports.insertSchedules = insertSchedules;
const database_1 = require("./database");
async function insertMovies(movies, movieEmbeddings) {
    if (movies.length === 0)
        return;
    const cs = new database_1.db.helpers.ColumnSet([
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
        { name: "embedding", mod: ":json" },
    ], { table: "filmes" });
    const data = movies
        .map((movie) => {
        const embeddingData = movieEmbeddings.find((emb) => emb.id === movie.id);
        return {
            ...movie,
            data_estreia: movie.data_estreia ? new Date(movie.data_estreia) : null,
            embedding: embeddingData ? embeddingData.embedding : null,
        };
    })
        .filter((item) => item.embedding !== null);
    if (data.length > 0) {
        await database_1.db.none(database_1.db.helpers.insert(data, cs));
    }
}
async function insertCinemas(cinemas, cinemaEmbeddings) {
    if (cinemas.length === 0)
        return;
    const cs = new database_1.db.helpers.ColumnSet([
        "nome",
        "endereco",
        "url_conferir_horarios",
        "url_comprar_ingresso",
        { name: "embedding", mod: ":json" },
    ], { table: "cinemas" });
    const data = cinemas
        .map((cinema) => {
        const embeddingData = cinemaEmbeddings.find((emb) => emb.id === cinema.id);
        return {
            ...cinema,
            embedding: embeddingData ? embeddingData.embedding : null,
        };
    })
        .filter((item) => item.embedding !== null);
    if (data.length > 0) {
        await database_1.db.none(database_1.db.helpers.insert(data, cs));
    }
}
async function insertSchedules(schedules, scheduleEmbeddings) {
    if (schedules.length === 0)
        return;
    const cs = new database_1.db.helpers.ColumnSet([
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
        const embeddingData = scheduleEmbeddings.find((emb) => emb.id_filme === schedule.id_filme &&
            emb.id_cinema === schedule.id_cinema);
        return {
            ...schedule,
            semana_inicio: schedule.semana_inicio
                ? new Date(schedule.semana_inicio)
                : null,
            semana_fim: schedule.semana_fim ? new Date(schedule.semana_fim) : null,
            embedding: embeddingData ? embeddingData.embedding : null,
        };
    })
        .filter((item) => item.embedding !== null);
    if (data.length > 0) {
        await database_1.db.none(database_1.db.helpers.insert(data, cs));
    }
}
//# sourceMappingURL=database-operations.js.map