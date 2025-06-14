import * as stringSimilarity from "string-similarity";
import { query } from "./db";

export async function findMovieIdByName(
  name: string
): Promise<{ id: number; name: string } | null> {
  const movies = await query("SELECT id, nome FROM filmes", []);
  if (!movies.length) return null;

  const movieNames = movies.map((m: any) => m.nome);
  const matches = stringSimilarity.findBestMatch(name, movieNames);

  if (matches.bestMatch.rating > 0.6) {
    const matchedMovie = movies.find(
      (m: any) => m.nome === matches.bestMatch.target
    );
    return matchedMovie
      ? { id: matchedMovie.id, name: matchedMovie.nome }
      : null;
  }
  return null;
}
