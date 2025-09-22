import * as stringSimilarity from "string-similarity";
import { query } from "./db";

function normalizeString(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/&/g, "e") // Replace & with e
    .replace(/[^a-z0-9\s]/g, "") // Remove special characters
    .replace(/\s+/g, " "); // Normalize spaces
}

export async function findMovieIdByName(
  name: string
): Promise<Array<{ id: number; name: string; data_estreia: Date }> | null> {
  const movies = await query("SELECT id, nome, data_estreia FROM filmes", []);
  if (!movies.length) return null;

  const normalizedInput = normalizeString(name);
  const inputWords = normalizedInput.split(" ").filter(Boolean);
  const movieData = movies.map((m: any) => ({
    id: m.id,
    originalName: m.nome,
    normalizedName: normalizeString(m.nome),
    data_estreia: m.data_estreia,
  }));

  // Fuzzy matching
  const normalizedMovieNames = movieData.map((m) => m.normalizedName);
  const matches = stringSimilarity.findBestMatch(
    normalizedInput,
    normalizedMovieNames
  );

  // 1. Se houver um match claro (rating >= 0.75 e diferença significativa para o segundo), retorna só ele
  const sortedRatings = matches.ratings
    .map((r, idx) => ({ ...r, idx }))
    .sort((a, b) => b.rating - a.rating);
  if (
    sortedRatings[0].rating >= 0.75 &&
    (sortedRatings.length === 1 ||
      sortedRatings[0].rating > sortedRatings[1].rating + 0.1)
  ) {
    const matchedMovie = movieData[sortedRatings[0].idx];
    return [
      {
        id: matchedMovie.id,
        name: matchedMovie.originalName,
        data_estreia: matchedMovie.data_estreia,
      },
    ];
  }

  // 2. Matches que contenham todas as palavras do termo informado
  let resultSet = new Map<
    number,
    { id: number; name: string; data_estreia: Date }
  >();
  if (inputWords.length > 1) {
    const allWordsMatches = movieData.filter((m) =>
      inputWords.every((w) => m.normalizedName.includes(w))
    );
    allWordsMatches.forEach((m) => {
      resultSet.set(m.id, {
        id: m.id,
        name: m.originalName,
        data_estreia: m.data_estreia,
      });
    });
  }

  // 3. Se não for específico, incluir todos os filmes que contenham a palavra-chave principal
  if (resultSet.size === 0 && normalizedInput.length >= 3) {
    const keyword = inputWords[0];
    const substringMatches = movieData.filter((m) =>
      m.normalizedName.includes(keyword)
    );
    substringMatches.forEach((m) => {
      resultSet.set(m.id, {
        id: m.id,
        name: m.originalName,
        data_estreia: m.data_estreia,
      });
    });
  }

  // 4. Fallback: prefix match para entradas curtas
  if (resultSet.size === 0 && normalizedInput.length >= 3) {
    const prefixMatches = movieData.filter((m) =>
      m.normalizedName.startsWith(normalizedInput)
    );
    prefixMatches.forEach((m) => {
      resultSet.set(m.id, {
        id: m.id,
        name: m.originalName,
        data_estreia: m.data_estreia,
      });
    });
  }

  // 5. Fallback: retorna o melhor match se rating >= 0.5
  if (resultSet.size === 0 && sortedRatings[0].rating >= 0.5) {
    const matchedMovie = movieData[sortedRatings[0].idx];
    return [
      {
        id: matchedMovie.id,
        name: matchedMovie.originalName,
        data_estreia: matchedMovie.data_estreia,
      },
    ];
  }

  if (resultSet.size > 0) {
    return Array.from(resultSet.values());
  }

  return null;
}
