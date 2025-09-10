interface Movie {
  identifier: string;
  name: string;
  abstract?: string;
  image?: { contentUrl: string }[];
}

interface WorkPresented {
  identifier: string;
  name?: string;
  movieDetails?: Movie;
}

interface Event {
  startDate: string;
  duration: string;
  generalFeatures: string;
  workPresented: WorkPresented;
}

interface ApiResponse {
  data: {
    events: Event[];
    movies?: Movie[];
  };
}

async function fetchGraphQL(query: string, variables?: any): Promise<any> {
  const response = await fetch("https://partnerapi.veloxtickets.com/graphql/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa("cine14bis:Rot1WUhaab2Q"),
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

async function getCompleteSchedule(): Promise<Event[]> {
  try {
    // 1. Obter as sessões e extrair IDs dos filmes
    const eventsQuery = `
      query {
        events(placeIdentifier: "GXP") {
          startDate
          duration
          generalFeatures
          workPresented {
            identifier
            name
          }
        }
      }
    `;

    const eventsResponse = await fetchGraphQL(eventsQuery);
    const events = eventsResponse.data.events;

    // Extrair IDs únicos dos filmes
    const movieIds = [
      ...new Set(events.map((e: Event) => e.workPresented.identifier)),
    ];

    // 2. Obter detalhes dos filmes
    const moviesQuery = `
      query GetMovies($ids: [String!]!) {
        movies(where: {identifier: {in: $ids}}) {
          identifier
          name
          abstract
          image {
            contentUrl
          }
        }
      }
    `;

    const moviesResponse = await fetchGraphQL(moviesQuery, { ids: movieIds });
    const movies = moviesResponse.data.movies;

    // 3. Combinar os dados
    return events.map((event) => {
      const movieDetails = movies.find(
        (m: Movie) => m.identifier === event.workPresented.identifier
      );

      return {
        ...event,
        workPresented: {
          ...event.workPresented,
          movieDetails,
        },
      };
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
}

// Uso da função principal
getCompleteSchedule()
  .then((completeSchedule) => {
    console.log("Dados completos:", completeSchedule);
    // Aqui você pode usar os dados no seu componente
  })
  .catch((error) => {
    console.error("Erro ao obter dados:", error);
  });
