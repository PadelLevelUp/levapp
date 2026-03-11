export const USE_MOCK_DATA =
  import.meta.env.VITE_USE_MOCK_DATA === "true" ||
  import.meta.env.VITE_USE_MOCK_DATA === undefined; // default to true when env var is not set
