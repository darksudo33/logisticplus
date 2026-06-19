import compression from "compression";
import express from "express";

import { applySecurityHeaders } from "./config/security.js";

export function createApp({ trustProxy = false, onApiErrorResponse } = {}) {
  const app = express();

  app.set("trust proxy", trustProxy);
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));

  if (typeof onApiErrorResponse === "function") {
    app.use((req, res, next) => {
      res.on("finish", () => {
        void onApiErrorResponse(req, res);
      });
      next();
    });
  }

  app.use(applySecurityHeaders);

  return app;
}

export { express };
