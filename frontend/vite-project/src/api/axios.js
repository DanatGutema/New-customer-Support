import axios from "axios";

const Axios = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5001/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// These must never trigger a refresh attempt (avoids loops / wrong errors).
const NO_REFRESH_ENDPOINTS = [
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/forgotpassword",
  "/auth/resetpassword",
  "/auth/signin-help",
];

const isNoRefreshEndpoint = (url = "") =>
  NO_REFRESH_ENDPOINTS.some((path) => url.includes(path));

// One in-flight refresh shared by all concurrent 401s.
let refreshPromise = null;

function clearSession() {
  try {
    localStorage.removeItem("jwt_token");
  } catch (_) {}
  window.dispatchEvent(new Event("auth:logout"));
}

Axios.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("jwt_token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (_) {}
  return config;
});

Axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (!response || response.status !== 401 || !config) {
      return Promise.reject(error);
    }

    if (isNoRefreshEndpoint(config.url)) {
      return Promise.reject(error);
    }

    // Nothing to refresh with (anonymous visitor) -> do not call /auth/refresh.
    let hasAccessToken = false;

    try {
      hasAccessToken = Boolean(localStorage.getItem("jwt_token"));
    } catch (_) {}

    if (!hasAccessToken) {
      return Promise.reject(error);
    }

    // Already retried once and still 401 -> give up and log out.
    if (config._retried) {
      clearSession();
      return Promise.reject(error);
    }

    config._retried = true;

    try {
      if (!refreshPromise) {
        refreshPromise = Axios.post("/auth/refresh")
          .then((res) => {
            const newToken = res.data?.accessToken;
            if (!newToken) throw new Error("No access token returned.");
            localStorage.setItem("jwt_token", newToken);
            return newToken;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newToken = await refreshPromise;

      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${newToken}`;

      return Axios(config);
    } catch (refreshError) {
      clearSession();
      return Promise.reject(refreshError);
    }
  }
);

export default Axios;

// import axios from "axios";

// const Axios = axios.create({
//   baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
//   withCredentials: true,
//   headers: {
//     "Content-Type": "application/json",
//   },
// });

// Axios.interceptors.request.use((config) => {
//   try {
//     const token = localStorage.getItem("jwt_token");

//     if (token) {
//       // ensure we do not accidentally overwrite other headers
//       config.headers = config.headers || {};
//       config.headers.Authorization = 'Bearer ' + token;
//     }
//   } catch (e) {
//     // localStorage may be unavailable in some environments
//     // fail silently and allow requests to continue without auth header
//   }

//   return config;
// });

// Axios.interceptors.response.use(
//   (response) => response,
//   (error) => {
//     if (error.response?.status === 401) {
//       try { localStorage.removeItem("jwt_token"); } catch (_) {}
//     }

//     return Promise.reject(error);
//   }
// );

// export default Axios;
