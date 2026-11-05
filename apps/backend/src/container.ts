import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { createAuthenticate, type Authenticate } from './middlewares/authenticate.js';
import { AuditService } from './modules/audit/audit.service.js';
import { AuthService } from './modules/auth/auth.service.js';
import { TokenService } from './modules/auth/token.service.js';
import { HealthService } from './modules/health/health.service.js';
import { RolesService } from './modules/roles/roles.service.js';
import { UsersService } from './modules/users/users.service.js';
import { CategoriesService } from './modules/categories/categories.service.js';
import { MovementsService } from './modules/inventory/movements.service.js';
import { StockItemsService } from './modules/inventory/stock-items.service.js';
import { MaterialsService } from './modules/materials/materials.service.js';
import { ProductFilesService } from './modules/products/product-files.service.js';
import { ProductsService } from './modules/products/products.service.js';
import { SuppliersService } from './modules/suppliers/suppliers.service.js';
import { FileStorage } from './services/file-storage.js';
import { createMailer, type Mailer } from './services/mailer.js';
import { PasswordHasher } from './utils/password.js';

export type ServicesConfig = Pick<
  Env,
  | 'NODE_ENV'
  | 'JWT_ACCESS_SECRET'
  | 'JWT_ACCESS_TTL'
  | 'REFRESH_TOKEN_TTL_DAYS'
  | 'BCRYPT_ROUNDS'
  | 'UPLOAD_DIR'
  | 'APP_URL'
  | 'SMTP_HOST'
  | 'SMTP_PORT'
  | 'SMTP_SECURE'
  | 'SMTP_USER'
  | 'SMTP_PASSWORD'
  | 'SMTP_FROM'
>;

export interface AppServices {
  health: HealthService;
  auth: AuthService;
  users: UsersService;
  roles: RolesService;
  audit: AuditService;
  authenticate: Authenticate;
  mailer: Mailer;
  storage: FileStorage;
  categories: CategoriesService;
  products: ProductsService;
  productFiles: ProductFilesService;
  suppliers: SuppliersService;
  materials: MaterialsService;
  stockItems: StockItemsService;
  movements: MovementsService;
}

export interface CreateServicesOptions {
  prisma: PrismaClient;
  config: ServicesConfig;
  logger: Logger;
  version: string;
  mailer?: Mailer;
}

/** Raiz de composição: único lugar onde as dependências são instanciadas e conectadas. */
export function createServices({
  prisma,
  config,
  logger,
  version,
  mailer = createMailer(config),
}: CreateServicesOptions): AppServices {
  const hasher = new PasswordHasher(config.BCRYPT_ROUNDS);
  const audit = new AuditService(prisma);
  const tokens = new TokenService(prisma, config);
  const auth = new AuthService({
    prisma,
    tokens,
    hasher,
    audit,
    mailer,
    logger,
    appUrl: config.APP_URL,
    isProduction: config.NODE_ENV === 'production',
  });

  const storage = new FileStorage(config.UPLOAD_DIR);
  const products = new ProductsService(prisma, audit);
  const movements = new MovementsService(prisma, audit);
  const materials = new MaterialsService(prisma, audit, movements);

  return {
    health: new HealthService({
      version,
      environment: config.NODE_ENV,
      database: {
        ping: async () => {
          await prisma.$queryRaw`SELECT 1`;
        },
      },
    }),
    auth,
    users: new UsersService({ prisma, hasher, audit, tokens, auth }),
    roles: new RolesService(prisma, audit),
    audit,
    authenticate: createAuthenticate(auth),
    mailer,
    storage,
    categories: new CategoriesService(prisma, audit),
    products,
    productFiles: new ProductFilesService(prisma, storage, products, audit),
    suppliers: new SuppliersService(prisma, audit),
    materials,
    stockItems: new StockItemsService(prisma, audit, materials),
    movements,
  };
}
