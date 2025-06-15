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
): Promise<{ id: number; name: string } | null> {
  const movies = await query("SELECT id, nome FROM filmes", []);
  if (!movies.length) return null;

  const normalizedInput = normalizeString(name);
  const movieData = movies.map((m: any) => ({
    id: m.id,
    originalName: m.nome,
    normalizedName: normalizeString(m.nome),
  }));

  // Fuzzy matching
  const normalizedMovieNames = movieData.map((m) => m.normalizedName);
  const matches = stringSimilarity.findBestMatch(
    normalizedInput,
    normalizedMovieNames
  );

  // Check for high-confidence fuzzy match
  if (matches.bestMatch.rating >= 0.75) {
    const matchedMovie = movieData.find(
      (m) => m.normalizedName === matches.bestMatch.target
    );
    if (matchedMovie) {
      return { id: matchedMovie.id, name: matchedMovie.originalName };
    }
  }

  // Fallback: exact prefix match for short inputs
  if (normalizedInput.length >= 3) {
    const prefixMatches = movieData.filter((m) =>
      m.normalizedName.startsWith(normalizedInput)
    );
    if (prefixMatches.length === 1) {
      return { id: prefixMatches[0].id, name: prefixMatches[0].originalName };
    }
  }

  // Fallback: highest-rated match if above 0.5 and unique
  if (matches.bestMatch.rating >= 0.5) {
    const topMatches = matches.ratings
      .filter((r) => r.rating >= 0.5)
      .sort((a, b) => b.rating - a.rating);
    if (
      topMatches.length === 1 ||
      topMatches[0].rating > topMatches[1]?.rating + 0.1
    ) {
      const matchedMovie = movieData.find(
        (m) => m.normalizedName === matches.bestMatch.target
      );
      if (matchedMovie) {
        return { id: matchedMovie.id, name: matchedMovie.originalName };
      }
    }
  }

  return null;
}
