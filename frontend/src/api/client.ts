import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function redirectToAuth() {
  localStorage.removeItem("accessToken");

  const authPath = "/auth";

  if (window.location.pathname !== authPath) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`${authPath}?next=${next}`);
  }
}

api.interceptors.response.use(
  (response) => {
    const newToken = response.headers["x-new-token"];
    if (newToken) {
      localStorage.setItem("accessToken", newToken);
    }
    return response;
  },
  (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      redirectToAuth();
    }

    return Promise.reject(error);
  }
);
