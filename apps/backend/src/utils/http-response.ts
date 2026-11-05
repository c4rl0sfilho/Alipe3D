import type { ApiFailure, ApiSuccess, PaginationMeta } from '@alipe3d/shared';
import type { Response } from 'express';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: PaginationMeta,
): Response<ApiSuccess<T>> {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(statusCode).json(body);
}

export function sendFailure(
  res: Response,
  statusCode: number,
  error: ApiFailure['error'],
): Response<ApiFailure> {
  return res.status(statusCode).json({ success: false, error });
}
