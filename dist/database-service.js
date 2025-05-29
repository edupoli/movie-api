"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertAllData = insertAllData;
exports.insertAllDataBatch = insertAllDataBatch;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "cinemas",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
});
async function insertMovies(movies, embeddings, client) {
    try {
        const embeddingMap = new Map(embeddings.map((e) => [e.id, e.embedding]));
        const insertQuery = `
      INSERT INTO filmes (
        id, nome, sinopse, duracao, classificacao, genero, 
        diretor, elenco_principal, data_estreia, url_poster, 
        url_trailer, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        sinopse = EXCLUDED.sinopse,
        duracao = EXCLUDED.duracao,
        classificacao = EXCLUDED.classificacao,
        genero = EXCLUDED.genero,
        diretor = EXCLUDED.diretor,
        elenco_principal = EXCLUDED.elenco_principal,
        data_estreia = EXCLUDED.data_estreia,
        url_poster = EXCLUDED.url_poster,
        url_trailer = EXCLUDED.url_trailer,
        embedding = EXCLUDED.embedding
    `;
        for (const movie of movies) {
            const embedding = embeddingMap.get(movie.id);
            if (!embedding) {
                console.warn(`Embedding não encontrado para o filme ID ${movie.id}`);
                continue;
            }
            await client.query(insertQuery, [
                movie.id,
                movie.nome,
                movie.sinopse || null,
                movie.duracao || null,
                movie.classificacao || null,
                movie.genero || null,
                movie.diretor || null,
                movie.elenco_principal || null,
                movie.data_estreia || null,
                movie.url_poster || null,
                movie.url_trailer || null,
                `[${embedding.join(",")}]`,
            ]);
        }
        console.log(`${movies.length} filmes inseridos com sucesso`);
    }
    catch (error) {
        console.error("Erro ao inserir filmes:", error);
        throw error;
    }
}
async function insertCinemas(cinemas, embeddings, client) {
    try {
        await client.query("DELETE FROM cinemas");
        const embeddingMap = new Map(embeddings.map((e) => [e.id, e.embedding]));
        const insertQuery = `
      INSERT INTO cinemas (
        id, nome, endereco, url_conferir_horarios, 
        url_comprar_ingresso, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        endereco = EXCLUDED.endereco,
        url_conferir_horarios = EXCLUDED.url_conferir_horarios,
        url_comprar_ingresso = EXCLUDED.url_comprar_ingresso,
        embedding = EXCLUDED.embedding
    `;
        for (const cinema of cinemas) {
            const embedding = embeddingMap.get(cinema.id);
            if (!embedding) {
                console.warn(`Embedding não encontrado para o cinema ID ${cinema.id}`);
                continue;
            }
            await client.query(insertQuery, [
                cinema.id,
                cinema.nome,
                cinema.endereco || null,
                cinema.url_conferir_horarios || null,
                cinema.url_comprar_ingresso || null,
                `[${embedding.join(",")}]`,
            ]);
        }
        console.log(`${cinemas.length} cinemas inseridos com sucesso`);
    }
    catch (error) {
        console.error("Erro ao inserir cinemas:", error);
        throw error;
    }
}
async function insertSchedules(schedules, embeddings, client) {
    try {
        await client.query("DELETE FROM programacao");
        const embeddingMap = new Map(embeddings.map((e) => [`${e.id_filme}-${e.id_cinema}`, e.embedding]));
        const insertQuery = `
      INSERT INTO programacao (
        id_filme, id_cinema, status, semana_inicio, semana_fim,
        segunda, terca, quarta, quinta, sexta, sabado, domingo, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;
        for (const schedule of schedules) {
            const embeddingKey = `${schedule.id_filme}-${schedule.id_cinema}`;
            const embedding = embeddingMap.get(embeddingKey);
            if (!embedding) {
                console.warn(`Embedding não encontrado para programação ${embeddingKey}`);
                continue;
            }
            await client.query(insertQuery, [
                schedule.id_filme,
                schedule.id_cinema,
                schedule.status || null,
                schedule.semana_inicio || null,
                schedule.semana_fim || null,
                schedule.segunda || null,
                schedule.terca || null,
                schedule.quarta || null,
                schedule.quinta || null,
                schedule.sexta || null,
                schedule.sabado || null,
                schedule.domingo || null,
                `[${embedding.join(",")}]`,
            ]);
        }
        console.log(`${schedules.length} programações inseridas com sucesso`);
    }
    catch (error) {
        console.error("Erro ao inserir programação:", error);
        throw error;
    }
}
async function insertAllData(movies, cinemas, schedules, movieEmbeddings, cinemaEmbeddings, scheduleEmbeddings) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await insertMovies(movies, movieEmbeddings, client);
        await insertCinemas(cinemas, cinemaEmbeddings, client);
        await insertSchedules(schedules, scheduleEmbeddings, client);
        await client.query("COMMIT");
        console.log("Todos os dados foram inseridos com sucesso!");
    }
    catch (error) {
        await client.query("ROLLBACK");
        console.error("Erro na inserção dos dados:", error);
        throw error;
    }
    finally {
        client.release();
    }
}
async function insertAllDataBatch(movies, cinemas, schedules, movieEmbeddings, cinemaEmbeddings, scheduleEmbeddings) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        if (movies.length > 0) {
            const embeddingMap = new Map(movieEmbeddings.map((e) => [e.id, e.embedding]));
            const movieValues = movies
                .map((movie) => {
                const embedding = embeddingMap.get(movie.id);
                return `(${movie.id}, '${movie.nome.replace(/'/g, "''")}', ${movie.sinopse ? `'${movie.sinopse.replace(/'/g, "''")}'` : "NULL"}, ${movie.duracao || "NULL"}, ${movie.classificacao ? `'${movie.classificacao}'` : "NULL"}, ${movie.genero ? `'${movie.genero}'` : "NULL"}, ${movie.diretor ? `'${movie.diretor}'` : "NULL"}, ${movie.elenco_principal
                    ? `'${movie.elenco_principal.replace(/'/g, "''")}'`
                    : "NULL"}, ${movie.data_estreia ? `'${movie.data_estreia}'` : "NULL"}, ${movie.url_poster ? `'${movie.url_poster}'` : "NULL"}, ${movie.url_trailer ? `'${movie.url_trailer}'` : "NULL"}, ${embedding ? `'[${embedding.join(",")}]'` : "NULL"})`;
            })
                .join(",");
            await client.query(`
        DELETE FROM programacao;
        DELETE FROM filmes;
        INSERT INTO filmes (id, nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal, data_estreia, url_poster, url_trailer, embedding) 
        VALUES ${movieValues}
      `);
        }
        await client.query("COMMIT");
        console.log("Dados inseridos em lote com sucesso!");
    }
    catch (error) {
        await client.query("ROLLBACK");
        console.error("Erro na inserção em lote:", error);
        throw error;
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=database-service.js.map