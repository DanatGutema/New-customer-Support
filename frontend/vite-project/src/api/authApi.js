import Axios from "./axios";
import { jwtDecode } from "jwt-decode";

export const AuthApi = {
  async login(credentials) {
    const res = await Axios.post(
      "/auth/login",
      credentials
    );

    localStorage.setItem(
      "jwt_token",
      res.data.accessToken
    );

    return jwtDecode(
      res.data.accessToken
    );
  },

  async signinHelp(data) {
    return Axios.post(
      "/auth/signin-help",
      data
    );
  },

   async logout() {
    try {
      await Axios.post("/auth/logout");
    } finally {
      localStorage.removeItem("jwt_token");
    }
  },


   async refresh() {
    const res = await Axios.post("/auth/refresh");
    const accessToken = res.data.accessToken;
    localStorage.setItem("jwt_token", accessToken);
    return jwtDecode(accessToken);
  },


};