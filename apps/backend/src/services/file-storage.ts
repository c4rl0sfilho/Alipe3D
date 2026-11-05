import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { PRODUCT_FILE_RULES, type ProductFileKind } from '@alipe3d/shared';
import { AppError } from '../utils/app-error.js';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.stl': 'model/stl',
  '.3mf': 'model/3mf',
  '.json': 'application/json',
  '.ini': 'text/plain',
  '.bbscfg': 'application/octet-stream',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

/** Tipo deduzido pela extensão quando o usuário não informa. */
export function inferFileKind(originalName: string): ProductFileKind | null {
  const ext = extname(originalName).toLowerCase();
  const order: ProductFileKind[] = ['IMAGE', 'MODEL_STL', 'MODEL_3MF', 'PRINT_PROFILE', 'DOCUMENT'];
  return order.find((kind) => PRODUCT_FILE_RULES[kind].extensions.includes(ext)) ?? null;
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, i) => buf[offset + i] === byte);

const isZip = (buf: Buffer) => startsWith(buf, [0x50, 0x4b, 0x03, 0x04]);

/** Texto: sem bytes nulos e decodificável como UTF-8 no trecho inicial. */
function isText(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, Math.min(buf.length, 4096)));
    return true;
  } catch {
    // Pode ter cortado um caractere multibyte no limite: tenta um pouco antes
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, Math.min(buf.length, 4090)));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Confere a assinatura real do conteúdo (não confia na extensão nem no MIME enviado pelo navegador).
 */
function contentMatches(ext: string, head: Buffer, sizeBytes: number): boolean {
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case '.png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case '.webp':
      return head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
    case '.pdf':
      return head.toString('ascii', 0, 5) === '%PDF-';
    case '.3mf':
      return isZip(head);
    case '.stl': {
      if (head.toString('ascii', 0, 5).toLowerCase() === 'solid' && isText(head)) return true;
      // STL binário: 80 bytes de cabeçalho + uint32 de triângulos + 50 bytes por triângulo
      if (head.length < 84) return false;
      const triangles = head.readUInt32LE(80);
      return sizeBytes === 84 + triangles * 50;
    }
    case '.bbscfg':
      return isZip(head) || isText(head);
    case '.json':
    case '.ini':
    case '.txt':
    case '.md':
      return isText(head);
    default:
      return false;
  }
}

export interface StoredFile {
  storedName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Arquivos de produto em disco. Os nomes no disco são sempre gerados pelo sistema. */
export class FileStorage {
  readonly root: string;
  readonly tempDir: string;
  private readonly productsDir: string;

  constructor(root: string) {
    this.root = resolve(root);
    this.tempDir = resolve(this.root, 'tmp');
    this.productsDir = resolve(this.root, 'products');
  }

  async init(): Promise<void> {
    await mkdir(this.tempDir, { recursive: true });
    await mkdir(this.productsDir, { recursive: true });
  }

  /**
   * Valida o arquivo temporário (extensão, tamanho e conteúdo) e o move para o destino final.
   * Em qualquer falha, o temporário é apagado.
   */
  async acceptUpload(
    tempPath: string,
    originalName: string,
    kind: ProductFileKind,
  ): Promise<StoredFile> {
    try {
      const ext = extname(originalName).toLowerCase();
      const rules = PRODUCT_FILE_RULES[kind];
      if (!rules.extensions.includes(ext)) {
        throw AppError.badRequest(
          `Extensão "${ext || 'sem extensão'}" não aceita para este tipo. Use: ${rules.extensions.join(', ')}.`,
        );
      }
      const { size } = await stat(tempPath);
      if (size === 0) throw AppError.badRequest('O arquivo está vazio.');
      if (size > rules.maxMb * 1024 * 1024) {
        throw AppError.badRequest(
          `Arquivo maior que o limite de ${rules.maxMb} MB para este tipo.`,
        );
      }

      const handle = await open(tempPath, 'r');
      const head = Buffer.alloc(Math.min(size, 8192));
      await handle.read(head, 0, head.length, 0);
      await handle.close();
      if (!contentMatches(ext, head, size)) {
        throw AppError.badRequest('O conteúdo do arquivo não corresponde à extensão informada.');
      }

      const storedName = `${randomUUID()}${ext}`;
      await rename(tempPath, this.pathFor(storedName));
      return {
        storedName,
        mimeType: MIME_BY_EXTENSION[ext] ?? 'application/octet-stream',
        sizeBytes: size,
      };
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  /** Caminho absoluto do arquivo, garantindo que não escapa do diretório de uploads. */
  pathFor(storedName: string): string {
    const full = resolve(this.productsDir, storedName);
    if (!full.startsWith(this.productsDir + sep))
      throw AppError.notFound('Arquivo não encontrado.');
    return full;
  }

  async exists(storedName: string): Promise<boolean> {
    try {
      await stat(this.pathFor(storedName));
      return true;
    } catch {
      return false;
    }
  }

  stream(storedName: string) {
    return createReadStream(this.pathFor(storedName));
  }

  async remove(storedName: string): Promise<void> {
    await rm(this.pathFor(storedName), { force: true });
  }
}
