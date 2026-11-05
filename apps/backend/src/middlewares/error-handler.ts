import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/app-error.js';
import { sendFailure } from '../utils/http-response.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  sendFailure(res, 404, {
    code: 'NOT_FOUND',
    message: `Rota não encontrada: ${req.method} ${req.path}`,
    requestId: String(req.id),
  });
};

/** Tratamento centralizado de erros. Nunca expõe stack trace ou detalhes internos ao cliente. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const requestId = String(req.id);

  if (err instanceof AppError) {
    sendFailure(res, err.statusCode, {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
      requestId,
    });
    return;
  }

  if (err instanceof ZodError) {
    sendFailure(res, 422, {
      code: 'VALIDATION_ERROR',
      message: 'Os dados enviados são inválidos.',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
      requestId,
    });
    return;
  }

  // Violações de integridade que escaparam das validações do service (ex.: corrida entre requisições)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      sendFailure(res, 409, {
        code: 'CONFLICT',
        message: 'Já existe um registro com estes dados.',
        requestId,
      });
      return;
    }
    if (err.code === 'P2025') {
      sendFailure(res, 404, { code: 'NOT_FOUND', message: 'Registro não encontrado.', requestId });
      return;
    }
  }

  // Erros do upload (tamanho, quantidade de arquivos)
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo maior que o limite de 150 MB.'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Envie um arquivo por vez, no campo "file".'
          : 'Não foi possível processar o envio do arquivo.';
    sendFailure(res, 400, { code: 'BAD_REQUEST', message, requestId });
    return;
  }

  // JSON malformado no corpo da requisição (body-parser)
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    sendFailure(res, 400, {
      code: 'BAD_REQUEST',
      message: 'O corpo da requisição não é um JSON válido.',
      requestId,
    });
    return;
  }

  logger.error({ err, requestId }, 'Erro não tratado');
  sendFailure(res, 500, {
    code: 'INTERNAL_ERROR',
    message: 'Ocorreu um erro inesperado. Tente novamente em instantes.',
    requestId,
  });
};
