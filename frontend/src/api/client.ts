import axios from "axios";

export const api = axios.create({
  baseURL: "http://127.0.0.1:5000",
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem("accessToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});