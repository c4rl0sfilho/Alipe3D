import { rateLimit } from 'express-rate-limit';
import { sendFailure } from '../utils/http-response.js';

export interface RateLimiterOptions {
  /** Não contar requisições bem-sucedidas (ex.: login correto não consome tentativas). */
  skipSuccessfulRequests?: boolean;
}

export function createRateLimiter(
  windowMs: number,
  limit: number,
  message: string,
  options: RateLimiterOptions = {},
) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    handler: (_req, res) => sendFailure(res, 429, { code: 'RATE_LIMITED', message }),
  });
}
